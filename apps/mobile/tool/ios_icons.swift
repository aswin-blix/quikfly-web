// Builds the iOS app icons (1024 px, opaque: iOS rejects transparency) from the square icons that
// `node scripts/app-icons.mjs` (repo root) draws from the logo.
//   swift tool/ios_icons.swift        (run from apps/mobile after running that script)
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

for (source, iconSet) in [("assets/icon/icon.png", "AppIcon"), ("assets/icon/icon-partner.png", "AppIcon-partner"), ("assets/icon/icon-captain.png", "AppIcon-captain")] {
  render("ios/Runner/Assets.xcassets/\(iconSet).appiconset/Icon-1024.png") { ctx in
    ctx.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
    ctx.fill(full)
    ctx.draw(load(source), in: full)
  }
}
