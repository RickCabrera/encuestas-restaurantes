import Foundation

/// Qué hacer con cada enlace del panel (misma regla que la app de Android, ver LinkPolicy.kt).
enum LinkPolicy {
    enum Action: Equatable {
        /// Se queda en la app: páginas del panel en el mismo servidor.
        case inApp
        /// Navegador: otros sitios, la encuesta del comensal y el sitio público.
        case browser
        /// mailto:, tel:, WhatsApp…: la app del teléfono que corresponda.
        case externalApp
    }

    private static let browserPaths = ["/r/", "/kiosk", "/inicio", "/privacidad"]

    static func decide(server: URL, url: URL) -> Action {
        guard let scheme = url.scheme?.lowercased() else { return .inApp }
        switch scheme {
        case "about", "data", "blob", "javascript": return .inApp
        case "http", "https": break
        default: return .externalApp
        }
        let sameServer = scheme == server.scheme?.lowercased()
            && url.host?.lowercased() == server.host?.lowercased()
            && port(url) == port(server)
        guard sameServer else { return .browser }
        let path = url.path.isEmpty ? "/" : url.path
        if path == "/" { return .browser }
        for p in browserPaths {
            let bare = p.hasSuffix("/") ? String(p.dropLast()) : p
            if path == bare || path.hasPrefix(p) { return .browser }
        }
        return .inApp
    }

    private static func port(_ u: URL) -> Int {
        if let p = u.port { return p }
        return u.scheme?.lowercased() == "http" ? 80 : 443
    }
}
