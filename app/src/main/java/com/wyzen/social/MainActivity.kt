package com.wyzen.social

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private val black = Color.rgb(12, 12, 12)
    private val gold = Color.rgb(212, 175, 55)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = black
        window.navigationBarColor = black

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(32, 32, 32, 32)
            setBackgroundColor(black)
        }

        val mark = TextView(this).apply {
            text = "W"
            textSize = 54f
            setTextColor(gold)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        root.addView(mark, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))

        val title = TextView(this).apply {
            text = "WYZEN SOCIAL"
            textSize = 25f
            letterSpacing = 0.16f
            setTextColor(gold)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        root.addView(title)

        val subtitle = TextView(this).apply {
            text = "Conecta-te ao teu mundo."
            textSize = 14f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
        }
        root.addView(subtitle)

        fun field(hintText: String, password: Boolean = false) {
            val edit = EditText(this).apply {
                hint = hintText
                setHintTextColor(Color.GRAY)
                setTextColor(Color.WHITE)
                textSize = 16f
                setPadding(18, 12, 18, 12)
                setBackgroundColor(Color.rgb( thirty(), thirty(), thirty()))
                if (password) inputType = 129
            }
            val params = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
            params.topMargin = 18
            root.addView(edit, params)
        }

        field("E-mail")
        field("Palavra-passe", true)

        fun action(label: String, filled: Boolean) {
            val button = Button(this).apply {
                text = label
                setTextColor(if (filled) black else gold)
                setBackgroundColor(if (filled) gold else Color.rgb(35, 35, 35))
                textSize = 15f
            }
            val params = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
            params.topMargin = 14
            root.addView(button, params)
        }

        action("ENTRAR", true)
        action("CRIAR CONTA", false)

        val signature = TextView(this).apply {
            text = "Podolsky Wyzen"
            textSize = 10f
            setTextColor(Color.GRAY)
            gravity = Gravity.CENTER
        }
        val sigParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        )
        sigParams.topMargin = 44
        root.addView(signature, sigParams)

        setContentView(root)
    }

    private fun thirty(): Int = 30
}
