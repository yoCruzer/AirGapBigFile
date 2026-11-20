// Local macOS test of the shipped file:// entry point in an isolated WebKit window.
import AppKit
import WebKit

guard CommandLine.arguments.count == 3, ["full", "short"].contains(CommandLine.arguments[2]) else {
    fatalError("Usage: transfer <absolute standalone HTML path> full|short")
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
let frame = NSRect(x: 0, y: 0, width: 1200, height: 800)
let web = WKWebView(frame: frame, configuration: config)
let window = NSWindow(contentRect: frame, styleMask: [.titled], backing: .buffered, defer: false)
window.contentView = web
window.title = "AirGap synthetic transfer check"
window.orderFrontRegardless()
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let scriptURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("transfer.js")
let script = try String(contentsOf: scriptURL, encoding: .utf8)
final class Delegate: NSObject, WKNavigationDelegate {
    func webView(_ view: WKWebView, didFinish navigation: WKNavigation!) {
        let args = ["shorten": CommandLine.arguments[2] == "short"]
        view.callAsyncJavaScript(script, arguments: args, in: nil, in: .page) { result in
            switch result {
            case .success(let value): print(value); exit(0)
            case .failure(let error): print(error); exit(1)
            }
        }
    }
}
let delegate = Delegate()
web.navigationDelegate = delegate
web.loadFileURL(url, allowingReadAccessTo: url)
DispatchQueue.main.asyncAfter(deadline: .now() + 120) { print("WebKit check timed out"); exit(1) }
app.run()
