package com.wyzen.social

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.io.OutputStreamWriter
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val api = "https://yxoxiwnkxpybjbiltbiu.supabase.co"
    private val apiKey = "sb_publishable_rRXB8Ox_7Koqep3fqUneig_DLnzYlT0"
    private val dark = Color.rgb(8, 10, 15)
    private val panel = Color.rgb(20, 24, 33)
    private val blue = Color.rgb(0, 153, 255)
    private val white = Color.rgb(242, 246, 255)
    private val io = Executors.newSingleThreadExecutor()
    private var token: String? = null
    private var userId: String? = null
    private lateinit var root: LinearLayout
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = dark
        window.navigationBarColor = dark
        token = getPreferences(0).getString("token", null)
        userId = getPreferences(0).getString("user_id", null)
        if (token != null) showFeed() else showAuth()
    }

    private fun baseColumn(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(22, 20, 22, 24)
        setBackgroundColor(dark)
    }

    private fun logo(parent: LinearLayout) {
        val mark = TextView(this).apply {
            text = "W"
            textSize = 58f
            gravity = Gravity.CENTER
            typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
            setTextColor(Color.BLACK)
            setShadowLayer(22f, 0f, 0f, blue)
            setPadding(30, 0, 30, 4)
        }
        parent.addView(mark, LinearLayout.LayoutParams(-1, 82))
        val name = TextView(this).apply {
            text = "WYZEN SOCIAL"
            textSize = 23f
            letterSpacing = .18f
            gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(white)
        }
        parent.addView(name)
        val line = View(this).apply { setBackgroundColor(blue) }
        val lp = LinearLayout.LayoutParams(72, 3).apply { gravity = Gravity.CENTER; topMargin = 10; bottomMargin = 18 }
        parent.addView(line, lp)
    }

    private fun label(value: String, size: Float = 15f): TextView = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(white)
    }

    private fun field(hintText: String, password: Boolean = false): EditText = EditText(this).apply {
        hint = hintText
        setHintTextColor(Color.rgb(130, 143, 160))
        setTextColor(white)
        textSize = 16f
        setSingleLine(!password)
        setPadding(16, 10, 16, 10)
        background = rounded(panel, 14f)
        if (password) inputType = 129
    }

    private fun rounded(color: Int, radius: Float): GradientDrawable =
        GradientDrawable().apply { setColor(color); cornerRadius = radius; setStroke(1, Color.rgb(43, 57, 75)) }

    private fun action(text: String, primary: Boolean = true, onTap: () -> Unit): Button =
        Button(this).apply {
            this.text = text
            isAllCaps = false
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(if (primary) Color.BLACK else blue)
            background = rounded(if (primary) blue else panel, 16f)
            setOnClickListener { onTap() }
        }

    private fun showAuth() {
        val page = baseColumn()
        page.gravity = Gravity.CENTER_VERTICAL
        logo(page)
        page.addView(label("A tua rede. A tua comunidade.", 17f))
        page.addView(label("Entra ou cria a tua conta para começares.", 13f).apply {
            setTextColor(Color.LTGRAY)
            setPadding(0, 5, 0, 22)
        })
        val email = field("E-mail")
        val password = field("Palavra-passe", true)
        page.addView(email, LinearLayout.LayoutParams(-1, 56).apply { bottomMargin = 12 })
        page.addView(password, LinearLayout.LayoutParams(-1, 56).apply { bottomMargin = 18 })
        status = label("", 13f)
        page.addView(action("ENTRAR") {
            authenticate(email.text.toString().trim(), password.text.toString(), false)
        }, LinearLayout.LayoutParams(-1, 54).apply { bottomMargin = 10 })
        page.addView(action("CRIAR CONTA", false) {
            authenticate(email.text.toString().trim(), password.text.toString(), true)
        }, LinearLayout.LayoutParams(-1, 54))
        page.addView(status)
        page.addView(label("WYZEN SOCIAL  •  Conecta-te sem limites", 11f).apply {
            gravity = Gravity.CENTER
            setTextColor(Color.GRAY)
            setPadding(0, 30, 0, 0)
        })
        setContentView(page)
    }

    private fun authenticate(email: String, password: String, signup: Boolean) {
        if (email.isBlank() || password.length < 6) {
            status.text = "Introduz um e-mail e uma palavra-passe com pelo menos 6 caracteres."
            return
        }
        status.text = "A ligar ao Supabase..."
        io.execute {
            try {
                val path = if (signup) "/auth/v1/signup" else "/auth/v1/token?grant_type=password"
                val result = request(path, "POST", JSONObject().put("email", email).put("password", password), null)
                val json = JSONObject(result)
                val access = json.optString("access_token")
                val id = json.optJSONObject("user")?.optString("id")
                if (access.isNotBlank() && id != null) {
                    token = access
                    userId = id
                    getPreferences(0).edit().putString("token", access).putString("user_id", id).apply()
                    runOnUiThread { showFeed() }
                } else {
                    runOnUiThread {
                        status.text = if (signup) "Conta criada. Confirma o e-mail e depois entra." else "Não foi possível iniciar sessão."
                    }
                }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Erro Supabase: ${e.message ?: "verifica a ligação"}" }
            }
        }
    }

    private fun showFeed() {
        val page = baseColumn()
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val brand = label("W", 34f).apply {
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.BLACK)
            setShadowLayer(14f, 0f, 0f, blue)
        }
        header.addView(brand, LinearLayout.LayoutParams(54, 54))
        header.addView(label("WYZEN SOCIAL", 18f), LinearLayout.LayoutParams(0, -2, 1f))
        header.addView(action("Sair", false) { logout() })
        page.addView(header)
        page.addView(label("O que se passa contigo?", 20f).apply {
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 18, 0, 12)
        })
        val composer = field("Partilha uma ideia com a comunidade...")
        composer.minLines = 2
        composer.maxLines = 4
        page.addView(composer, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = 10 })
        page.addView(action("PUBLICAR") {
            val content = composer.text.toString().trim()
            if (content.isNotEmpty()) createPost(content)
        }, LinearLayout.LayoutParams(-1, 50).apply { bottomMargin = 20 })
        page.addView(label("FEED", 13f).apply {
            setTextColor(blue)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, 10)
        })
        status = label("A carregar publicações...", 13f)
        page.addView(status)
        val scrollContent = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        page.addView(scrollContent, LinearLayout.LayoutParams(-1, 0, 1f))
        page.addView(action("ATUALIZAR FEED", false) { loadPosts(scrollContent) },
            LinearLayout.LayoutParams(-1, 48).apply { topMargin = 12 })
        val scroll = ScrollView(this).apply { addView(page) }
        setContentView(scroll)
        loadPosts(scrollContent)
    }

    private fun loadPosts(container: LinearLayout) {
        status.text = "A carregar publicações..."
        io.execute {
            try {
                val body = request("/rest/v1/posts?select=id,content,created_at,user_id&order=created_at.desc&limit=50", "GET", null, token)
                val posts = JSONArray(body)
                runOnUiThread {
                    container.removeAllViews()
                    if (posts.length() == 0) container.addView(label("Ainda não existem publicações. Sê a primeira pessoa a publicar!", 14f))
                    for (i in 0 until posts.length()) {
                        val item = posts.getJSONObject(i)
                        val card = LinearLayout(this).apply {
                            orientation = LinearLayout.VERTICAL
                            setPadding(16, 14, 16, 14)
                            background = rounded(panel, 16f)
                        }
                        card.addView(label("Membro WYZEN", 12f).apply { setTextColor(blue); typeface = Typeface.DEFAULT_BOLD })
                        card.addView(label(item.optString("content"), 16f).apply { setPadding(0, 9, 0, 8) })
                        card.addView(label(item.optString("created_at").replace("T", " ").take(16), 10f).apply { setTextColor(Color.GRAY) })
                        container.addView(card, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = 12 })
                    }
                    status.text = "${posts.length()} publicação(ões)"
                }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Feed indisponível: ${e.message ?: "confirma a tabela posts no Supabase"}" }
            }
        }
    }

    private fun createPost(content: String) {
        val id = userId ?: return
        io.execute {
            try {
                request("/rest/v1/posts", "POST",
                    JSONObject().put("user_id", id).put("content", content), token, "return=minimal")
                runOnUiThread { showFeed() }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Não foi possível publicar: ${e.message}" }
            }
        }
    }

    private fun request(path: String, method: String, body: JSONObject?, accessToken: String?, prefer: String? = null): String {
        val connection = (URL(api + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15000
            readTimeout = 15000
            setRequestProperty("apikey", apiKey)
            setRequestProperty("Authorization", "Bearer ${accessToken ?: apiKey}")
            setRequestProperty("Content-Type", "application/json")
            if (prefer != null) setRequestProperty("Prefer", prefer)
            if (body != null) doOutput = true
        }
        if (body != null) OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val response = stream?.bufferedReader()?.use { it.readText() } ?: ""
        connection.disconnect()
        if (code !in 200..299) throw Exception("HTTP $code: ${response.take(220)}")
        return response
    }

    private fun logout() {
        token = null
        userId = null
        getPreferences(0).edit().remove("token").remove("user_id").apply()
        showAuth()
    }

    override fun onDestroy() {
        super.onDestroy()
        io.shutdown()
    }
}
