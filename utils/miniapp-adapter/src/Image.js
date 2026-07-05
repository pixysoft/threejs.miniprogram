import * as Mixin from './util/mixin'
import HTMLImageElement from './HTMLImageElement'
import { _canvas } from './Canvas'

export default function Image() {
	let canvas = _canvas;
	if (!canvas) {
		throw new Error('please register a canvas')
	}
	const image = canvas.createImage();

	// image.__proto__.__proto__.__proto__ = new HTMLImageElement();

	if (!('tagName' in image)) {
		image.tagName = 'IMG'
	}

	// createImage() 返回的微信原生对象只有 on* 属性, 而 ImageLoader 走
	// addEventListener('load'/'error'), 这里补一层映射(P0 #2)
	if (typeof image.addEventListener !== 'function') {
		image.addEventListener = function (type, listener) {
			const wrapper = function (event) {
				listener.call(image, event)
			}
			wrapper._listener = listener
			image['on' + type] = wrapper
		}
		image.removeEventListener = function (type, listener) {
			const current = image['on' + type]
			if (current && (current === listener || current._listener === listener)) {
				image['on' + type] = null
			}
		}
	}

	Mixin.parentNode(image);
	Mixin.classList(image);

	return image;
};
