// Builds the iOS app icons (1024 px, opaque: iOS rejects transparency) from the Android icon art.
//   swift tool/ios_icons.swift        (run from apps/mobile after changing assets/icon/)
// QuikFly: assets/icon/icon.png on the dark brand background (adaptive_icon_background in pubspec.yaml).
// QuikFly Partner: its adaptive foreground over its background, zoomed in like Android's mask.
import AppKit

let size = 1024

func load(_ path: String) -> CGImage {
  guard let img = NSImage(contentsOfFile: path)?.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { fatalError("can't read \(path)") }
  return img
}

func render(_ out: String, draw: (CGContext) -> Void) {
  let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  ctx.interpolationQuality = .high
  draw(ctx)
  let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
  print("wrote \(out)")
}

let full = CGRect(x: 0, y: 0, width: size, height: size)

render("ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-1024.png") { ctx in
  ctx.setFillColor(red: 0x07 / 255, green: 0x07 / 255, blue: 0x0A / 255, alpha: 1) // #07070A
  ctx.fill(full)
  ctx.draw(load("assets/icon/icon.png"), in: full)
}

render("ios/Runner/Assets.xcassets/AppIcon-partner.appiconset/Icon-1024.png") { ctx in
  // Android shows about the middle 72 of the 108 dp layers. Zoom a little less than that (1.3x, not 1.5x)
  // so the sparkle stays clear of iOS's rounded corners.
  let scale = 1.3
  let layer = CGRect(x: -Double(size) * (scale - 1) / 2, y: -Double(size) * (scale - 1) / 2,
                     width: Double(size) * scale, height: Double(size) * scale)
  ctx.draw(load("assets/icon/partner/ic_launcher_background.png"), in: layer)
  ctx.draw(load("assets/icon/partner/ic_launcher_foreground.png"), in: layer)
}
