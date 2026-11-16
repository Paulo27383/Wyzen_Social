package com.wyzen.social

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private val base = "https://yxoxiwnkxpybjbiltbiu.supabase.co"
    private val apiKey = "sb_publishable_rRXB8Ox_7Koqep3fqUneig_DLnzYlT0"
    private val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()
    private val handler = Handler(Looper.getMainLooper())
    private var token = ""
    private var uid = ""
    private var admin = false
    private var conversationId = ""
    private var pollingFailures = 0
    private var lastShownError = ""
    private lateinit var root: LinearLayout
    private lateinit var messageBox: EditText
    private lateinit var messageList: LinearLayout
    private val bg = Color.rgb(8,8,8)
    private val card = Color.rgb(23,23,23)
    private val lime = Color.rgb(183,245,66)
    private val muted = Color.rgb(160,160,160)
    private val white = Color.WHITE
    private val refreshMessages = object: Runnable {
        override fun run() {
            if (conversationId.isNotBlank()) fetchMessages(conversationId, false)
            handler.postDelayed(this, if (pollingFailures > 0) 15000 else 8000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor=bg
        window.navigationBarColor=bg
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        val p=getSharedPreferences("wyzen_session",MODE_PRIVATE)
        token=p.getString("token","") ?: ""
        uid=p.getString("uid","") ?: ""
        if(token.isNotBlank() && uid.isNotBlank()) membershipCheck() else authScreen()
    }

    private fun initRoot() {
        root=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setBackgroundColor(bg); setPadding(dp(16),dp(12),dp(16),dp(10)) }
        setContentView(root)
    }
    private fun dp(v:Int)=(v*resources.displayMetrics.density).toInt()
    private fun params()=LinearLayout.LayoutParams(-1,-2)
    private fun gap(h:Int)=View(this).apply{layoutParams=LinearLayout.LayoutParams(1,dp(h))}
    private fun text(s:String,size:Float=14f,color:Int=white,bold:Boolean=false)=TextView(this).apply{
        text=s;textSize=size;setTextColor(color);if(bold)setTypeface(null,Typeface.BOLD);setPadding(dp(2),dp(7),dp(2),dp(7))
    }
    private fun input(hintText:String,password:Boolean=false)=EditText(this).apply{
        hint=hintText;setHintTextColor(muted);setTextColor(white);textSize=15f;setSingleLine(true);setPadding(dp(13),dp(9),dp(13),dp(9))
        background=android.graphics.drawable.GradientDrawable().apply{setColor(card);cornerRadius=dp(12).toFloat();setStroke(dp(1),Color.DKGRAY)}
        if(password)inputType=129
    }
    private fun button(s:String,primary:Boolean=false,action:()->Unit)=Button(this).apply{
        text=s;isAllCaps=false;textSize=14f;setTextColor(if(primary)bg else white)
        background=android.graphics.drawable.GradientDrawable().apply{setColor(if(primary)lime else Color.rgb(48,48,48));cornerRadius=dp(12).toFloat()}
        setOnClickListener{action()}
    }
    private fun authScreen() {
        initRoot()
        root.gravity=Gravity.CENTER_VERTICAL
        root.addView(text("WYZEN CHAT",30f,lime,true))
        root.addView(text("MENSAGENS PRIVADAS · MÁXIMO 50 MEMBROS",10f,muted,true))
        root.addView(gap(12))
        val fullName=input("Nome completo (para criar conta)")
        val email=input("Email")
        val password=input("Palavra-passe",true)
        val invite=input("Código de convite (obrigatório para convidados)")
        invite.setText(getSharedPreferences("wyzen_session",MODE_PRIVATE).getString("pending_invite","") ?: "")
        root.addView(fullName,params());root.addView(gap(9))
        root.addView(email,params());root.addView(gap(9))
        root.addView(password,params());root.addView(gap(9))
        root.addView(invite,params());root.addView(gap(15))
        root.addView(button("ENTRAR",true){
            val e=email.text.toString().trim();val p=password.text.toString()
            if(e.isBlank()||p.length<6){toast("Introduz email e palavra-passe (mínimo 6 caracteres).")}else signIn(e,p,invite.text.toString().trim())
        },params())
        root.addView(gap(8))
        root.addView(button("CRIAR CONTA"){
            val n=fullName.text.toString().trim();val e=email.text.toString().trim();val p=password.text.toString()
            if(n.isBlank()||e.isBlank()||p.length<6)toast("Preenche nome, email e palavra-passe (mínimo 6 caracteres).") else signUp(n,e,p,invite.text.toString().trim())
        },params())
    }
    private fun signUp(name:String,email:String,password:String,invite:String) {
        if(!password.contains(Regex("[a-z]")) || !password.contains(Regex("[A-Z]")) || !password.contains(Regex("[0-9]"))) {
            alert("A palavra-passe deve conter pelo menos uma letra minúscula, uma maiúscula e um número.")
            return
        }
        busy("A validar convite e a criar conta...")
        api("POST","/rest/v1/rpc/wyzen_registration_allowed",JSONObject().put("p_code",invite),false){allowed,checkError->
            if(checkError!=null || allowed.toString().trim().toBoolean()!=true) {
                authScreen()
                alert(if(checkError!=null) "Não foi possível validar o registo.\n$checkError" else "Depois da criação do administrador, só é possível criar contas com um convite válido.")
                return@api
            }
            getSharedPreferences("wyzen_session",MODE_PRIVATE).edit().putString("pending_invite",invite).apply()
            val data=JSONObject().put("full_name",name)
            api("POST","/auth/v1/signup",JSONObject().put("email",email).put("password",password).put("data",data),false){v,e->
                if(e!=null){authScreen();alert(e);return@api}
                val obj=v as? JSONObject
                if(obj==null||obj.optString("access_token").isBlank()){
                    authScreen();alert("Conta criada. Confirma o email recebido e depois entra na aplicação. O convite ficou guardado neste dispositivo.")
                }else saveSession(obj,invite)
            }
        }
    }
    private fun signIn(email:String,password:String,invite:String) {
        busy("A validar a conta...")
        api("POST","/auth/v1/token?grant_type=password",JSONObject().put("email",email).put("password",password),false){v,e->
            if(e!=null){authScreen();alert(e)}else saveSession(v as JSONObject,invite.ifBlank { getSharedPreferences("wyzen_session",MODE_PRIVATE).getString("pending_invite","") ?: "" })
        }
    }
    private fun saveSession(data:JSONObject,invite:String) {
        token=data.optString("access_token")
        uid=data.optJSONObject("user")?.optString("id","") ?: ""
        if(token.isBlank()||uid.isBlank()){authScreen();alert("O servidor não devolveu uma sessão válida.");return}
        getSharedPreferences("wyzen_session",MODE_PRIVATE).edit().putString("token",token).putString("uid",uid).apply()
        val pending=invite.ifBlank { getSharedPreferences("wyzen_session",MODE_PRIVATE).getString("pending_invite","") ?: "" }
        if(pending.isNotBlank())redeem(pending) else membershipCheck()
    }
    private fun membershipCheck() {
        busy("A verificar acesso...")
        api("POST","/rest/v1/rpc/wyzen_bootstrap_admin",JSONObject(),true){v,e->
            if(e!=null){busy("");alert("A migração SQL do WYZEN CHAT ainda precisa de ser aplicada no Supabase.\n\n"+e);return@api}
            val o=v as? JSONObject ?: JSONObject()
            admin=o.optBoolean("is_admin",false)
            if(o.optBoolean("is_member",false)){
                getSharedPreferences("wyzen_session",MODE_PRIVATE).edit().remove("pending_invite").apply()
                homeScreen()
            } else inviteDialog()
        }
    }
    private fun inviteDialog() {
        val code=input("Código de convite")
        AlertDialog.Builder(this).setTitle("Acesso privado")
            .setMessage("Esta conta ainda não é membro. Introduz um convite do administrador.")
            .setView(code).setCancelable(false)
            .setPositiveButton("Validar"){_,_->redeem(code.text.toString().trim())}
            .setNegativeButton("Sair"){_,_->logout()}.show()
    }
    private fun redeem(code:String) {
        if(code.isBlank()){inviteDialog();return}
        api("POST","/rest/v1/rpc/wyzen_redeem_invite",JSONObject().put("p_code",code),true){_,e->
            if(e!=null){alert("Convite inválido/expirado ou limite de 50 membros atingido.\n"+e);inviteDialog()}
            else{admin=false;getSharedPreferences("wyzen_session",MODE_PRIVATE).edit().remove("pending_invite").apply();homeScreen()}
        }
    }
    private fun homeScreen() {
        conversationId="";handler.removeCallbacks(refreshMessages);initRoot()
        val top=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL}
        top.addView(text("WYZEN CHAT",25f,lime,true),LinearLayout.LayoutParams(0,dp(48),1f))
        top.addView(button("SAIR"){logout()})
        root.addView(top)
        root.addView(text("PRIVADO · APENAS MEMBROS AUTORIZADOS · 50 VAGAS",10f,muted,true))
        val actions=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
        actions.addView(button("＋ CONVERSA",true){createConversation(false)},LinearLayout.LayoutParams(0,dp(48),1f).apply{rightMargin=dp(5)})
        actions.addView(button("＋ GRUPO"){createConversation(true)},LinearLayout.LayoutParams(0,dp(48),1f).apply{leftMargin=dp(5)})
        root.addView(actions)
        if(admin)root.addView(button("GERAR CONVITE DE MEMBRO"){makeInvite()},params())
        root.addView(text("AS TUAS CONVERSAS",12f,lime,true))
        val scroll=ScrollView(this)
        val list=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
        scroll.addView(list);root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        api("GET","/rest/v1/conversation_members?select=conversation_id,conversations(id,title,is_group)&user_id=eq."+uid,null,true){v,e->
            if(e!=null){list.removeAllViews();list.addView(text("Não foi possível carregar as conversas. Verifica a configuração do servidor.",14f,muted));showFriendlyError(e);return@api}
            list.removeAllViews()
            val rows=v as? JSONArray ?: JSONArray()
            if(rows.length()==0){list.addView(text("Ainda não tens conversas. Cria uma conversa ou um grupo.",14f,muted));return@api}
            for(i in 0 until rows.length()){
                val conv=rows.optJSONObject(i)?.optJSONObject("conversations")?:continue
                val id=conv.optString("id")
                val title=conv.optString("title").ifBlank{"Conversa WYZEN"}
                val item=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(13),dp(9),dp(13),dp(9));background=android.graphics.drawable.GradientDrawable().apply{setColor(card);cornerRadius=dp(13).toFloat()}}
                item.addView(text(title,16f,white,true))
                item.addView(text(if(conv.optBoolean("is_group"))"Grupo privado" else "Conversa privada",11f,muted))
                item.setOnClickListener{openConversation(id,title)}
                list.addView(item,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})
            }
        }
    }
    private fun createConversation(group:Boolean) {
        api("GET","/rest/v1/profiles?select=id,username,full_name&order=full_name.asc",null,true){v,e->
            if(e!=null){toast(e);return@api}
            val rows=v as? JSONArray?:JSONArray()
            val ids=ArrayList<String>();val names=ArrayList<String>()
            for(i in 0 until rows.length()){
                val p=rows.optJSONObject(i)?:continue
                if(p.optString("id")==uid)continue
                ids.add(p.optString("id"));names.add(p.optString("full_name").ifBlank{p.optString("username")}+" (@"+p.optString("username")+")")
            }
            if(ids.isEmpty()){toast("Ainda não existem outros membros activos.");return@api}
            val checked=BooleanArray(ids.size)
            val title=input(if(group)"Nome do grupo" else "Nome da conversa")
            val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(15),dp(5),dp(15),0);addView(title,params())}
            AlertDialog.Builder(this).setTitle(if(group)"Novo grupo" else "Nova conversa").setView(box)
                .setMultiChoiceItems(names.toTypedArray(),checked){_,which,on->checked[which]=on}
                .setPositiveButton("Criar"){_,_->
                    val members=JSONArray();for(i in ids.indices)if(checked[i])members.put(ids[i])
                    if(members.length()==0){toast("Selecciona pelo menos um membro.");return@setPositiveButton}
                    val name=title.text.toString().trim().ifBlank{if(group)"Grupo WYZEN" else "Conversa privada"}
                    val payload=JSONObject().put("p_title",name).put("p_is_group",group).put("p_member_ids",members)
                    api("POST","/rest/v1/rpc/wyzen_create_conversation",payload,true){_,err->
                        if(err!=null)toast(err)else{toast("Conversa criada.");homeScreen()}
                    }
                }.setNegativeButton("Cancelar",null).show()
        }
    }
    private fun makeInvite() {
        api("POST","/rest/v1/rpc/wyzen_create_invite",JSONObject().put("p_max_uses",1).put("p_valid_days",7),true){v,e->
            if(e!=null){toast(e);return@api}
            val code=if(v is String)v else v.toString().trim('"')
            AlertDialog.Builder(this).setTitle("Convite criado").setMessage("Partilha este código apenas com a pessoa convidada:\n\n"+code+"\n\nUma utilização · válido 7 dias.")
                .setPositiveButton("OK",null).show()
        }
    }
    private fun openConversation(id:String,title:String) {
        conversationId=id;pollingFailures=0;handler.removeCallbacks(refreshMessages);initRoot()
        val top=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL}
        top.addView(button("‹"){handler.removeCallbacks(refreshMessages);homeScreen()})
        top.addView(text(title,18f,white,true),LinearLayout.LayoutParams(0,-2,1f))
        root.addView(top)
        val scroll=ScrollView(this);messageList=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
        scroll.addView(messageList);root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        val composer=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL}
        messageBox=input("Escreve uma mensagem...")
        composer.addView(messageBox,LinearLayout.LayoutParams(0,dp(52),1f))
        composer.addView(button("ENVIAR",true){sendMessage()},LinearLayout.LayoutParams(dp(90),dp(50)).apply{leftMargin=dp(6)})
        root.addView(composer)
        fetchMessages(id,true);handler.postDelayed(refreshMessages,4000)
    }
    private fun fetchMessages(id:String,initial:Boolean) {
        api("GET","/rest/v1/messages?select=id,content,sender_id,created_at&conversation_id=eq."+id+"&order=created_at.asc&limit=150",null,true){v,e->
            if(e!=null){pollingFailures++;if(initial)showFriendlyError(e);return@api}
            pollingFailures=0
            if(!::messageList.isInitialized)return@api
            messageList.removeAllViews()
            val rows=v as? JSONArray?:JSONArray()
            for(i in 0 until rows.length()){
                val m=rows.optJSONObject(i)?:continue
                val mine=m.optString("sender_id")==uid
                val bubble=TextView(this).apply{
                    text=m.optString("content");textSize=15f;setTextColor(if(mine)bg else white);setPadding(dp(12),dp(9),dp(12),dp(9))
                    background=android.graphics.drawable.GradientDrawable().apply{setColor(if(mine)lime else Color.rgb(42,42,42));cornerRadius=dp(15).toFloat()}
                }
                val line=LinearLayout(this).apply{gravity=if(mine)Gravity.RIGHT else Gravity.LEFT;addView(bubble)}
                messageList.addView(line,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(4);bottomMargin=dp(4)})
            }
            if(initial||rows.length()>0)messageList.post{(messageList.parent as? ScrollView)?.fullScroll(View.FOCUS_DOWN)}
        }
    }
    private fun sendMessage() {
        val content=messageBox.text.toString().trim()
        if(content.isBlank()||conversationId.isBlank())return
        messageBox.isEnabled=false
        val payload=JSONObject().put("conversation_id",conversationId).put("sender_id",uid).put("content",content)
        api("POST","/rest/v1/messages",payload,true){_,e->
            messageBox.isEnabled=true
            if(e!=null)toast(e)else{messageBox.setText("");fetchMessages(conversationId,false)}
        }
    }
    private fun logout() {
        handler.removeCallbacks(refreshMessages);getSharedPreferences("wyzen_session",MODE_PRIVATE).edit().clear().apply()
        token="";uid="";admin=false;conversationId="";authScreen()
    }
    private fun busy(s:String){initRoot();root.addView(text("WYZEN CHAT",26f,lime,true));root.addView(text(s,14f,white))}
    private fun alert(s:String){AlertDialog.Builder(this).setTitle("WYZEN CHAT").setMessage(s).setPositiveButton("OK",null).show()}
    private fun toast(s:String){Toast.makeText(this,s,Toast.LENGTH_SHORT).show()}
    private fun showFriendlyError(raw:String) {
        val clean = when {
            raw.contains("HTTP 401") || raw.contains("JWT", true) -> "A sessão expirou. Sai da conta e volta a entrar."
            raw.contains("HTTP 403") || raw.contains("permission", true) || raw.contains("policy", true) -> "O acesso foi recusado pelas permissões da base de dados. É necessária uma correcção no Supabase."
            raw.contains("HTTP 404") || raw.contains("does not exist", true) -> "Falta uma tabela ou função no Supabase. A configuração da base de dados precisa de ser corrigida."
            raw.contains("HTTP 400") -> "O servidor rejeitou os dados enviados. A operação não foi concluída."
            raw.contains("HTTP 5") -> "O servidor Supabase está temporariamente indisponível. Tenta novamente dentro de instantes."
            else -> "Não foi possível concluir esta operação. Verifica a ligação e tenta novamente."
        }
        if(clean != lastShownError) { lastShownError = clean; alert(clean) }
    }
    private fun api(method:String,path:String,body:JSONObject?,auth:Boolean,done:(Any?,String?)->Unit) {
        val b=Request.Builder().url(base+path).addHeader("apikey",apiKey).addHeader("Accept","application/json")
        if(auth&&token.isNotBlank())b.addHeader("Authorization","Bearer "+token)
        if(body!=null)b.addHeader("Content-Type","application/json")
        val rb=body?.toString()?.toRequestBody("application/json; charset=utf-8".toMediaType())
        when(method){"GET"->b.get();"POST"->b.post(rb?:ByteArray(0).toRequestBody(null));"PATCH"->b.patch(rb?:ByteArray(0).toRequestBody(null));else->b.delete()}
        client.newCall(b.build()).enqueue(object:Callback{
            override fun onFailure(call:Call,e:IOException){runOnUiThread{done(null,e.message?:"Falha de rede.")}}
            override fun onResponse(call:Call,response:Response){
                val raw=response.body?.string().orEmpty()
                runOnUiThread{
                    if(!response.isSuccessful){
                        var msg=raw
                        try{val j=JSONObject(raw);msg=j.optString("message",j.optString("msg",j.optString("error_description",raw)))}catch(_:Exception){}
                        done(null,"HTTP "+response.code+": "+msg)
                    }else{
                        val parsed:Any?=try{when{raw.isBlank()->JSONObject();raw.trim().startsWith("[")->JSONArray(raw);raw.trim().startsWith("{")->JSONObject(raw);raw.trim().startsWith("\"")->raw.trim().trim('"');else->raw}}catch(_:Exception){raw}
                        done(parsed,null)
                    }
                }
            }
        })
    }
}
