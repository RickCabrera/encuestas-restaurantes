package mx.sitirt.encuestas.admin

import mx.sitirt.encuestas.admin.LinkPolicy.Action
import org.junit.Assert.assertEquals
import org.junit.Test

class LinkPolicyTest {
    private val server = "https://cuentanos.com.mx"
    private fun d(url: String) = LinkPolicy.decide(server, url)

    @Test
    fun panelPagesStayInApp() {
        assertEquals(Action.IN_APP, d("https://cuentanos.com.mx/admin"))
        assertEquals(Action.IN_APP, d("https://cuentanos.com.mx/admin/points?tel=5512345678"))
        assertEquals(Action.IN_APP, d("https://cuentanos.com.mx/login"))
        assertEquals(Action.IN_APP, d("https://CUENTANOS.com.mx:443/plataforma"))
        assertEquals(Action.IN_APP, d("https://cuentanos.com.mx/api/qr/x?format=pdf"))
    }

    @Test
    fun dinerSurveyAndPublicSiteGoToBrowser() {
        assertEquals(Action.BROWSER, d("https://cuentanos.com.mx/r/gorilocos"))
        assertEquals(Action.BROWSER, d("https://cuentanos.com.mx/"))
        assertEquals(Action.BROWSER, d("https://cuentanos.com.mx"))
        assertEquals(Action.BROWSER, d("https://cuentanos.com.mx/kiosk"))
        assertEquals(Action.BROWSER, d("https://cuentanos.com.mx/privacidad"))
    }

    @Test
    fun otherSitesAndInsecureGoToBrowser() {
        assertEquals(Action.BROWSER, d("https://example.com/admin"))
        assertEquals(Action.BROWSER, d("https://cuentanos.com.mx.evil.com/admin"))
        assertEquals(Action.BROWSER, d("http://cuentanos.com.mx/admin"))
        assertEquals(Action.BROWSER, d("https://cuentanos.com.mx:8443/admin"))
    }

    @Test
    fun otherSchemesOpenTheirApp() {
        assertEquals(Action.EXTERNAL_APP, d("mailto:hola@cuentanos.com.mx"))
        assertEquals(Action.EXTERNAL_APP, d("tel:5512345678"))
        assertEquals(Action.EXTERNAL_APP, d("whatsapp://send?text=hola"))
        assertEquals(Action.IN_APP, d("about:blank"))
    }
}
