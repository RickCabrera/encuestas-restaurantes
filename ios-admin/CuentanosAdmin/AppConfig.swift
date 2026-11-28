import UIKit

enum AppConfig {
    /// Servidor del panel; viene de Info.plist (CUENTANOS_SERVER_URL en project.yml).
    static var serverURL: URL {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "CuentanosServerURL") as? String) ?? ""
        return URL(string: raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))) ?? URL(string: "https://cuentanos.com.mx")!
    }

    static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
    }
}

/// Los mismos tonos que la app web (src/app/globals.css).
enum Palette {
    static let night = UIColor(red: 0x10 / 255, green: 0x12 / 255, blue: 0x16 / 255, alpha: 1)
    static let paper = UIColor(red: 0xF6 / 255, green: 0xF4 / 255, blue: 0xEF / 255, alpha: 1)
    static let ink = UIColor(red: 0x17 / 255, green: 0x18 / 255, blue: 0x1C / 255, alpha: 1)
    static let inkSoft = UIColor(red: 0x5B / 255, green: 0x5E / 255, blue: 0x66 / 255, alpha: 1)
    static let basil = UIColor(red: 0x0E / 255, green: 0x8A / 255, blue: 0x6E / 255, alpha: 1)
}
