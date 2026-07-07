/**
 * UIBatcher — 同纹理 UISprite 合批（对标 cocos Batcher2D 最小实现, CPU 路线取 pixi）
 *
 * createUI(THREE, { batch: true }) 开启。每帧(UIRoot.update 末尾):
 *   DFS 按渲染序收集可见 UISprite → 按 (纹理, 裁剪组, worldAlpha) 切连续段
 *   → 每段写一个 BatchMesh(动态缓冲: position/uv/color) → 原 mesh 隐藏
 * draw call 从 O(sprite 数) 降到 O(段数)。树序切段保证画序不变。
 *
 * 不进批(走原 mesh): 带 rotation 的节点及其子树 / UILabel / NineSlice /
 * node.batchable === false。纯色 sprite 统一走 1x1 白纹理 + 顶点色 tint。
 */

'use strict';

const CAPACITY_START = 64;   // 每段初始 quad 容量

function UIBatcher(ctx) {
    this.ctx = ctx;
    const THREE = ctx.THREE;

    this.group = new THREE.Group();      // 批 mesh 容器(世界坐标, 挂 scene 原点)
    ctx.root.scene.add(this.group);

    // 纯色 sprite 共用的 1x1 白纹理
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    white.needsUpdate = true;
    this._whiteTex = white;

    this._pool = [];          // 段 mesh 池
    this._batchedMeshes = []; // 上一帧被隐藏的原 mesh(用于退批还原)
}

/* ---------------- 收集 ---------------- */

UIBatcher.prototype._collect = function (root) {
    const segments = [];
    let cur = null;

    function flush() { cur = null; }

    const self = this;
    (function walk(node, rotated) {
        if (!node._visible) return;
        rotated = rotated || node._rotation !== 0;

        const isSprite = !!(node.mesh && node.material && node.material.isMeshBasicMaterial
            && !node._insets && node.setFrame && node.batchable !== false);
        const renders = node.mesh && node.material;

        if (isSprite && !rotated && node.width > 0 && node.height > 0 && node.material.opacity > 0) {
            const tex = node.material.map || self._whiteTex;
            const clip = node._clipPlanes || null;
            const alpha = Math.round(node.material.opacity * 1000) / 1000;
            if (!cur || cur.texture !== tex || cur.clip !== clip || cur.alpha !== alpha) {
                cur = {
                    texture: tex, clip: clip, alpha: alpha,
                    order: node.mesh.renderOrder,
                    sprites: [],
                };
                segments.push(cur);
            }
            cur.sprites.push(node);
        } else if (renders) {
            flush();   // 其他可渲染元素打断连续段(保画序)
        }

        for (let i = 0; i < node.children.length; i++) walk(node.children[i], rotated);
    })(root, false);

    return segments;
};

/* ---------------- 段 mesh ---------------- */

UIBatcher.prototype._acquireMesh = function (index, quadCount) {
    const THREE = this.ctx.THREE;
    let entry = this._pool[index];

    if (!entry || entry.capacity < quadCount) {
        let capacity = entry ? entry.capacity : CAPACITY_START;
        while (capacity < quadCount) capacity *= 2;

        const geo = new THREE.BufferGeometry();
        const pos = new THREE.BufferAttribute(new Float32Array(capacity * 4 * 3), 3);
        const uv = new THREE.BufferAttribute(new Float32Array(capacity * 4 * 2), 2);
        const color = new THREE.BufferAttribute(new Float32Array(capacity * 4 * 3), 3);
        if (pos.setUsage && THREE.DynamicDrawUsage !== undefined) {
            pos.setUsage(THREE.DynamicDrawUsage);
            uv.setUsage(THREE.DynamicDrawUsage);
            color.setUsage(THREE.DynamicDrawUsage);
        }
        geo.setAttribute('position', pos);
        geo.setAttribute('uv', uv);
        geo.setAttribute('color', color);

        const indices = new Uint16Array(capacity * 6);
        for (let q = 0; q < capacity; q++) {
            const v = q * 4, i = q * 6;
            indices[i] = v; indices[i + 1] = v + 2; indices[i + 2] = v + 1;
            indices[i + 3] = v + 2; indices[i + 4] = v + 3; indices[i + 5] = v + 1;
        }
        geo.setIndex(new THREE.BufferAttribute(indices, 1));

        const mat = new THREE.MeshBasicMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            vertexColors: THREE.VertexColors !== undefined ? THREE.VertexColors : true,
        });

        if (entry) {
            entry.mesh.geometry.dispose();
            entry.mesh.material.dispose();
            this.group.remove(entry.mesh);
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        this.group.add(mesh);
        entry = { mesh: mesh, capacity: capacity };
        this._pool[index] = entry;
    }
    return entry;
};

UIBatcher.prototype._fillSegment = function (entry, seg) {
    const geo = entry.mesh.geometry;
    const pos = geo.attributes.position.array;
    const uv = geo.attributes.uv.array;
    const color = geo.attributes.color.array;

    for (let s = 0; s < seg.sprites.length; s++) {
        const sprite = seg.sprites[s];
        const b = sprite.worldAABB();
        const srcUV = sprite.mesh.geometry.attributes.uv.array;
        const tint = sprite.material.map ? { r: 1, g: 1, b: 1 } : sprite.material.color;

        const p = s * 4 * 3, u = s * 4 * 2, c = s * 4 * 3;
        // 顶点序与共享 plane 几何一致: (0,0)(1,0)(0,-1)(1,-1) → 世界矩形
        const x0 = b.x, x1 = b.x + b.w, y0 = -b.y, y1 = -(b.y + b.h);
        pos[p] = x0;     pos[p + 1] = y0;  pos[p + 2] = 0;
        pos[p + 3] = x1; pos[p + 4] = y0;  pos[p + 5] = 0;
        pos[p + 6] = x0; pos[p + 7] = y1;  pos[p + 8] = 0;
        pos[p + 9] = x1; pos[p + 10] = y1; pos[p + 11] = 0;

        for (let k = 0; k < 8; k++) uv[u + k] = srcUV[k];

        for (let v = 0; v < 4; v++) {
            color[c + v * 3] = tint.r;
            color[c + v * 3 + 1] = tint.g;
            color[c + v * 3 + 2] = tint.b;
        }
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, seg.sprites.length * 6);

    const mat = entry.mesh.material;
    mat.map = seg.texture;
    mat.opacity = seg.alpha;
    mat.clippingPlanes = seg.clip;
    mat.needsUpdate = true;
    entry.mesh.renderOrder = seg.order;
    entry.mesh.visible = true;
};

/* ---------------- 每帧入口 ---------------- */

UIBatcher.prototype.rebuild = function (root) {
    // 退批还原上一帧隐藏的原 mesh
    for (let i = 0; i < this._batchedMeshes.length; i++) {
        this._batchedMeshes[i].visible = true;
    }
    this._batchedMeshes.length = 0;

    const segments = this._collect(root);
    this.segmentCount = segments.length;

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const entry = this._acquireMesh(i, seg.sprites.length);
        this._fillSegment(entry, seg);
        for (let s = 0; s < seg.sprites.length; s++) {
            seg.sprites[s].mesh.visible = false;
            this._batchedMeshes.push(seg.sprites[s].mesh);
        }
    }

    // 隐藏多余池 mesh
    for (let i = segments.length; i < this._pool.length; i++) {
        if (this._pool[i]) this._pool[i].mesh.visible = false;
    }
};

UIBatcher.prototype.destroy = function () {
    for (let i = 0; i < this._batchedMeshes.length; i++) this._batchedMeshes[i].visible = true;
    this._batchedMeshes.length = 0;
    for (let i = 0; i < this._pool.length; i++) {
        if (this._pool[i]) {
            this._pool[i].mesh.geometry.dispose();
            this._pool[i].mesh.material.dispose();
        }
    }
    this._pool.length = 0;
    this.ctx.root.scene.remove(this.group);
    this._whiteTex.dispose();
};

module.exports = UIBatcher;
