import XCTest
@testable import CuentanosAdmin

final class LinkPolicyTests: XCTestCase {
    private let server = URL(string: "https://cuentanos.com.mx")!
    private func d(_ s: String) -> LinkPolicy.Action { LinkPolicy.decide(server: server, url: URL(string: s)!) }

    func testPanelPagesStayInApp() {
        XCTAssertEqual(d("https://cuentanos.com.mx/admin"), .inApp)
        XCTAssertEqual(d("https://cuentanos.com.mx/admin/points?tel=5512345678"), .inApp)
        XCTAssertEqual(d("https://cuentanos.com.mx/login"), .inApp)
        XCTAssertEqual(d("https://CUENTANOS.com.mx:443/plataforma"), .inApp)
        XCTAssertEqual(d("https://cuentanos.com.mx/api/qr/x?format=pdf"), .inApp)
    }

    func testDinerSurveyAndPublicSiteGoToBrowser() {
        XCTAssertEqual(d("https://cuentanos.com.mx/r/gorilocos"), .browser)
        XCTAssertEqual(d("https://cuentanos.com.mx/"), .browser)
        XCTAssertEqual(d("https://cuentanos.com.mx"), .browser)
        XCTAssertEqual(d("https://cuentanos.com.mx/kiosk"), .browser)
    }

    func testOtherSitesAndInsecureGoToBrowser() {
        XCTAssertEqual(d("https://example.com/admin"), .browser)
        XCTAssertEqual(d("https://cuentanos.com.mx.evil.com/admin"), .browser)
        XCTAssertEqual(d("http://cuentanos.com.mx/admin"), .browser)
        XCTAssertEqual(d("https://cuentanos.com.mx:8443/admin"), .browser)
    }

    func testOtherSchemesOpenTheirApp() {
        XCTAssertEqual(d("mailto:hola@cuentanos.com.mx"), .externalApp)
        XCTAssertEqual(d("tel:5512345678"), .externalApp)
        XCTAssertEqual(d("about:blank"), .inApp)
    }
}
