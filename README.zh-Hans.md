# AirGap BigFile

[English](README.md) | 简体中文

AirGap BigFile 是 AirGapFree 推荐的浏览器大文件光学发送端。它准备一个本地文件，
在屏幕上循环显示 CIMBAR 编码，由独立的 iOS AirGapFree 接收端用相机扫描。
文件选择、哈希、编码与发送都在浏览器本地完成，不会上传文件。
在线网页加载需要网络；下载后的 standalone HTML 才可以完全离线使用。

## 使用

### 在线

在电脑上打开 [GitHub Pages Sender](https://yocruzer.github.io/AirGapBigFile/)。
网页加载需要网络，所选文件内容始终在浏览器本地处理。

### 离线

从 [GitHub Releases](https://github.com/yoCruzer/AirGapBigFile/releases/tag/v1.1.0)
下载 [AirGapBigFile-v1.1.0.standalone.html](https://github.com/yoCruzer/AirGapBigFile/releases/download/v1.1.0/AirGapBigFile-v1.1.0.standalone.html)，
之后可在发送电脑上双击，通过 `file://` 离线打开。
同时下载 `SHA256SUMS.txt`，可运行 `shasum -a 256 -c SHA256SUMS.txt` 验证完整性。

### 发送文件

1. 打开在线 Sender 或离线文件，推荐保持稳定默认配置 **15 FPS / 2×**。
2. 在页首选择「简体中文」或 English。切换无需刷新，也不会中断准备或发送。
   首次按浏览器语言选择；手动偏好优先。仅语言偏好保存在 localStorage 中，
   不保存文件名、文件内容或哈希。浏览器禁用存储时仍可使用，偏好可能无法跨刷新保留。
3. 选择或拖入一个文件，等待分块和 SHA-256 校验信息准备完成。
4. 点击「开始发送」，用 AirGapFree 扫描屏幕；可全屏展示。
5. 「暂停」后点击「继续」会延续当前编码流；「停止」后可以重新调整发送参数。
6. 若 AirGapFree 报告缺失分块，在「定向重传」选择对应编号并定向发送，
   完成后可返回正常轮播。重新访问分块会重启该分块的喷泉编码序列。

## 高级设置与指标

- 分块大小：5 MiB / 10 MiB，自动模式优先 5 MiB；最多 120 块。
  逐块 `File.slice()` 读取并增量计算完整文件哈希，不将整个大文件一次读入内存。
- 目标 FPS：12、15（默认）、18、20、24、30。30 是本轮实验上限。
- 冗余度：1.2×（快速 / 实验性）、1.5×、2×（默认）、3×。
  更低冗余度可缩短每轮展示，但识别条件差时可能需要更多重传。
- 发送和暂停期间 FPS / 冗余度锁定；停止后解锁。文件准备后分块大小仍锁定。
- 实际 FPS 与帧间隔：统计约最近 2 秒内可见发送期间的浏览器帧提交，
  至少积累 1 秒样本才显示；开始及继续时重置，暂停时间不计入。
  这不是经验证的屏幕物理输出，也不是接收端速率。
- 当前帧组剩余时间、预计一轮轮播 / 定向循环时长：优先使用实际 FPS，
  样本不足则使用目标 FPS。估计基于帧数，不含准备和未来分块加载耗时。

页面进入后台时自动暂停，回来后必须手动继续。系统没有把页面标为隐藏的窗口遮挡，
浏览器可能无法检测，请自行确保编码画面对准相机且未被遮挡。
发送期间尽力请求屏幕唤醒锁；暂停、停止或运行失败时释放。
若浏览器拒绝或不支持，发送仍可进行，并提示你自行确保电脑不会熄屏。

**没有 ACK / 反向信道。Sender 不知道 AirGapFree 是否完成接收。**
上述时长不能当作文件传输完成倒计时。实际端到端 KiB/s 只能由接收端完成时间计算。
高 FPS 与 1.2× 属于实验配置，依赖设备，不保证更快、更可靠；需按[真机测试矩阵](docs/SENDER_V1_1_DEVICE_TEST.md)验证。

## 开发与构建

维护源码为 `send.html` 和 `src/`。不要手动修改生成的 standalone。
要求 Node.js 20+、npm 和 Python 3，无需新增 npm 依赖。

```bash
npm test
npm run check
python3 scripts/build-standalone.py
python3 scripts/verify-standalone.py
```

构建将应用脚本、本地 SHA-256 库及固定版本 WASM / glue 完整内嵌。
验证检查源码同步、确定性、无外部脚本或样式引用，以及固定 WASM SHA-256。

## 协议与验收状态

协议仍为 v1：`version: 1`、`tool: "cimbar-bigfile"`，清单后接分块，
保留 30 帧最小连续帧组。没有修改 AirGapFree、libcimbar v0.6.4、WASM 或 mode 68。

- [v1 架构](docs/AIRGAP_BIGFILE_V1.md)
- [Manifest v1 规范](docs/manifest-spec.md)
- [上游来源](UPSTREAM.md)与[第三方声明](THIRD_PARTY_NOTICES.md)

用户已报告候选 `140c2d1` 的真机基础 E2E：**PASS**，Sender 正常发送、
AirGapFree 正常接收。公开发行保留同一 Sender runtime。
尚未完成广泛的设备与性能矩阵，实验配置效果依赖具体设备。

安全漏洞请走[私密安全报告](SECURITY.md)，普通 bug 和兼容性问题可提交到
[Issues](https://github.com/yoCruzer/AirGapBigFile/issues)。
项目自有代码遵循 [MIT 许可证](LICENSE)，第三方组件保留各自许可证。
