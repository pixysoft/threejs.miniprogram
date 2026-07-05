// 统一毫秒(P1 #5): wx.getPerformance().now() 真机返回微秒、devtools 返回毫秒,
// 旧实现真机除以 1000 后与 devtools 行为不一致, Clock 的 delta 在两端差 1000 倍。
// 这里统一封装为「相对启动时刻的毫秒数」, 无 getPerformance 时回退 Date.now。
let performance

const wxPerf = wx.getPerformance ? wx.getPerformance() : null

if (wxPerf && typeof wxPerf.now === 'function') {
  const { platform } = wx.getSystemInfoSync()
  const toMs = platform === 'devtools' ? 1 : 1000
  const initTime = wxPerf.now()

  performance = {
    now: function () {
      return (wxPerf.now() - initTime) / toMs
    }
  }
} else {
  const initTime = Date.now()

  performance = {
    now: function () {
      return Date.now() - initTime
    }
  }
}

export default performance
