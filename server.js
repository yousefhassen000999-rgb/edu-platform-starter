require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const SQLiteStoreFactory = require("connect-sqlite3");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SITE = process.env.SITE_NAME || "منصة تعلّم";
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "academy.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'student', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS courses (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subject TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', price_egp INTEGER NOT NULL DEFAULT 0,
 instructor TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS enrollments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 course_id INTEGER NOT NULL REFERENCES courses(id), status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,course_id)
);
CREATE TABLE IF NOT EXISTS lessons (
 id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id),
 title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', video_url TEXT NOT NULL DEFAULT '',
 sort_order INTEGER NOT NULL DEFAULT 0
);
`);
const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
if (!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "ChangeThisPassword123!", 12);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')")
    .run(process.env.ADMIN_NAME || "مدير المنصة", adminEmail, hash);
}
if (db.prepare("SELECT COUNT(*) AS n FROM courses").get().n === 0) {
  const add = db.prepare("INSERT INTO courses(title,subject,description,price_egp,instructor,published) VALUES(?,?,?,?,?,1)");
  add.run("تأسيس الرياضيات", "رياضيات", "مسار تأسيسي منظم مع شرح وتدريبات.", 200, "فريق المنصة");
  add.run("مبادئ الفيزياء", "فيزياء", "ابدأ المفاهيم الأساسية خطوة بخطوة.", 250, "فريق المنصة");
  add.run("أساسيات اللغة الإنجليزية", "لغات", "مفردات وقواعد وتطبيقات عملية.", 180, "فريق المنصة");
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));
const SQLiteStore = SQLiteStoreFactory(session);
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000*60*60*8 }
}));

const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const money = n => new Intl.NumberFormat("ar-EG").format(Number(n)||0);
const user = req => req.session.user;
const requireLogin = (req,res,next) => user(req) ? next() : res.redirect("/login");
const requireAdmin = (req,res,next) => user(req)?.role === "admin" ? next() : res.redirect("/login");
const hasAccess = (uid,cid) => !!db.prepare("SELECT id FROM enrollments WHERE user_id=? AND course_id=? AND status='approved'").get(uid,cid);
function layout(req,title,content){
 const u=user(req);
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1220"><title>${esc(title)} | ${esc(SITE)}</title><link rel="stylesheet" href="/styles.css"></head><body>
 <header class="topbar"><a class="brand" href="/"><span class="brand-mark">ت</span><span>${esc(SITE)}<small>تعلّم. تطوّر. انطلق.</small></span></a>
 <nav><a href="/courses">الكورسات</a>${u?'<a href="/my-courses">تعليمي</a>':''}${u?.role==="admin"?'<a href="/admin">الإدارة</a>':''}
 <button class="theme-toggle" id="themeToggle" type="button" aria-label="تغيير المظهر">☾ <span>المظهر</span></button>
 ${u?`<span class="user-chip">${esc(u.name)}</span><form class="inline" method="post" action="/logout"><button class="nav-button" type="submit">خروج</button></form>`:'<a class="nav-cta" href="/login">دخول</a><a class="nav-button" href="/register">حساب جديد</a>'}</nav></header>
 <main>${content}</main><footer><span>© ${new Date().getFullYear()} ${esc(SITE)}</span><span>التعليم حق للجميع</span></footer><script src="/app.js" defer></script></body></html>`;
}
function page(req,res,title,content,status=200){res.status(status).send(layout(req,title,content));}
function flash(text,kind="info"){return `<div class="notice ${kind}">${esc(text)}</div>`;}

app.get("/",(req,res)=>{
 const courses=db.prepare("SELECT * FROM courses WHERE published=1 ORDER BY id DESC LIMIT 3").all();
 page(req,res,"الرئيسية",`<section class="hero"><div class="hero-copy"><span class="eyebrow">منصة تعليمية مرنة</span><h1>معرفتك القادمة،<br><em>تبدأ من هنا.</em></h1><p>مكان واحد يجمع الكورسات في مختلف المواد، بخطوات واضحة وتجربة تعلّم بسيطة.</p><div class="hero-actions"><a class="button primary" href="/courses">استكشف الكورسات <span>←</span></a><a class="button ghost" href="/register">ابدأ حسابك</a></div><div class="trust-row"><span>✓ مواد متنوعة</span><span>✓ متابعة منظمة</span><span>✓ اشتراك بمراجعة بشرية</span></div></div><div class="hero-art"><div class="orb orb-a"></div><div class="orb orb-b"></div><div class="learning-card"><div class="card-top"><span class="live-dot"></span> مساحة تعلّمك</div><div class="book-icon">✦</div><h3>خطوة صغيرة كل يوم</h3><p>تعلّم على إيقاعك، وارجع لمحتواك في أي وقت.</p><div class="progress"><span></span></div><small>رحلتك تبدأ بخطوة</small></div><div class="floating-note">✎ <span>تعلّم مستمر</span></div></div></section>
 <section class="section"><div class="section-heading"><div><span class="eyebrow">اختيارات البداية</span><h2>كورسات مختارة</h2></div><a class="text-link" href="/courses">عرض كل الكورسات ←</a></div><div class="course-grid">${courses.map(courseCard).join("")}</div></section>
 <section class="callout"><div><span class="eyebrow">للمعلمين والمدربين</span><h2>حوّل خبرتك إلى تجربة تعليمية منظمة</h2><p>إدارة الكورسات والطلاب وطلبات الاشتراك من مكان واحد.</p></div><a class="button primary" href="/register">أنشئ حسابًا</a></section>`);
});
function courseCard(c){return `<article class="course-card"><div class="course-art art-${(c.id%3)+1}"><span>${esc(c.subject)}</span><b>${["✦","⌘","◈"][c.id%3]}</b></div><div class="course-info"><div class="course-meta"><span>${esc(c.subject)}</span><span>مسار تعليمي</span></div><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><div class="course-bottom"><strong>${money(c.price_egp)} ج.م</strong><a class="small-link" href="/courses/${c.id}">التفاصيل ←</a></div></div></article>`;}
app.get("/courses",(req,res)=>{
 const q=String(req.query.q||"").trim();
 const courses=q?db.prepare("SELECT * FROM courses WHERE published=1 AND (title LIKE ? OR subject LIKE ? OR description LIKE ?) ORDER BY id DESC").all(`%${q}%`,`%${q}%`,`%${q}%`):db.prepare("SELECT * FROM courses WHERE published=1 ORDER BY id DESC").all();
 page(req,res,"الكورسات",`<section class="page-head"><span class="eyebrow">مكتبة التعلّم</span><h1>اختار مسارك القادم</h1><p>ابحث حسب اسم الكورس أو المادة.</p><form class="search-form" method="get"><input name="q" value="${esc(q)}" placeholder="مثال: فيزياء، لغات، رياضيات"><button class="button primary">بحث</button></form></section><div class="course-grid">${courses.map(courseCard).join("")||'<div class="empty-state">لا توجد كورسات مطابقة لبحثك.</div>'}</div>`);
});
app.get("/courses/:id",(req,res)=>{
 const c=db.prepare("SELECT * FROM courses WHERE id=? AND published=1").get(Number(req.params.id));
 if(!c)return page(req,res,"غير موجود",`<section class="empty-state"><h1>الكورس غير موجود</h1><a href="/courses">العودة للكورسات</a></section>`,404);
 const u=user(req), approved=u&&(u.role==="admin"||hasAccess(u.id,c.id));
 const enrollment=u?db.prepare("SELECT status FROM enrollments WHERE user_id=? AND course_id=?").get(u.id,c.id):null;
 const lessons=approved?db.prepare("SELECT * FROM lessons WHERE course_id=? ORDER BY sort_order,id").all(c.id):[];
 const content=approved?`<section class="course-detail"><div class="detail-head"><span class="eyebrow">${esc(c.subject)}</span><h1>${esc(c.title)}</h1><p>${esc(c.description)}</p></div><div class="lesson-list"><h2>محتوى الكورس</h2>${lessons.map(l=>`<article class="lesson"><span class="lesson-number">${l.sort_order+1}</span><div><h3>${esc(l.title)}</h3>${l.body?`<p>${esc(l.body)}</p>`:""}${l.video_url?`<p><a class="text-link" href="${esc(l.video_url)}" target="_blank" rel="noopener">فتح رابط الدرس ↗</a></p>`:""}</div></article>`).join("")||'<p class="muted">لم تُضف دروس لهذا الكورس بعد. يرجى مراجعة المدرس.</p>'}</div></section>`:
`<section class="course-detail"><div class="detail-head"><span class="eyebrow">${esc(c.subject)}</span><h1>${esc(c.title)}</h1><p>${esc(c.description)}</p><div class="price-large">${money(c.price_egp)} <small>جنيه مصري</small></div></div><aside class="panel purchase-panel"><h2>ابدأ التعلّم</h2><p>بعد إرسال طلب الاشتراك، ستظهر بيانات التحويل. يتم تفعيل الكورس بعد مراجعة الدفع من الإدارة.</p>${!u?'<a class="button primary full" href="/login">سجّل الدخول للاشتراك</a>':enrollment?`<div class="status-box"><b>${enrollment.status==="approved"?"تم تفعيل الاشتراك":enrollment.status==="pending"?"طلبك قيد المراجعة":"الطلب مرفوض"}</b><p>${enrollment.status==="pending"?'أكمل التحويل وأرسل الإيصال إذا لم تفعل ذلك بعد.':""}</p>${enrollment.status==="pending"?`<a class="button primary full" href="/payment-info/${c.id}">بيانات الدفع</a>`:""}</div>`:`<form method="post" action="/courses/${c.id}/enroll"><button class="button primary full">اطلب الاشتراك</button></form>`}<p class="tiny-note">لا يتم فتح المحتوى المدفوع تلقائيًا بناءً على صورة الإيصال.</p></aside></section>`;
 page(req,res,c.title,content);
});
app.post("/courses/:id/enroll",requireLogin,(req,res)=>{
 if(user(req).role==="admin")return res.redirect("/admin");
 const c=db.prepare("SELECT id FROM courses WHERE id=? AND published=1").get(Number(req.params.id));
 if(!c)return res.redirect("/courses");
 db.prepare("INSERT OR IGNORE INTO enrollments(user_id,course_id,status) VALUES(?,?,'pending')").run(user(req).id,c.id);
 res.redirect(`/payment-info/${c.id}`);
});
app.get("/payment-info/:id",requireLogin,(req,res)=>{
 const c=db.prepare("SELECT * FROM courses WHERE id=? AND published=1").get(Number(req.params.id));
 if(!c)return res.redirect("/courses");
 const e=db.prepare("SELECT status FROM enrollments WHERE user_id=? AND course_id=?").get(user(req).id,c.id);
 if(user(req).role!=="admin"&&!e)return res.redirect(`/courses/${c.id}`);
 const phone=process.env.PAYMENT_PHONE||"01005871579";
 const insta=process.env.INSTAPAY_HANDLE||phone;
 const wa=(process.env.WHATSAPP_NUMBER||"201021468303").replace(/\D/g,"");
 const message=encodeURIComponent(`السلام عليكم، أريد تأكيد تحويل اشتراك كورس ${c.title}. اسمي: ${user(req).name}. سأرسل إيصال التحويل للمراجعة.`);
 page(req,res,"بيانات الدفع",`<section class="page-head"><span class="eyebrow">خطوة أخيرة قبل التفعيل</span><h1>بيانات الدفع</h1><p>حوّل قيمة الكورس ثم أرسل الإيصال. الإدارة ستتحقق من وصول المبلغ قبل تفعيل المحتوى.</p></section><div class="payment-layout"><section class="panel payment-summary"><span class="muted">الكورس المطلوب</span><h2>${esc(c.title)}</h2><div class="price-large">${money(c.price_egp)} <small>جنيه مصري</small></div><div class="notice info">احتفظ بالإيصال حتى تنتهي مراجعة الطلب.</div></section><section class="panel payment-options"><h2>اختر طريقة التحويل</h2><div class="payment-method"><div class="method-icon">IP</div><div><h3>InstaPay</h3><p>حوّل إلى الحساب/المعرّف التالي</p><strong dir="ltr">${esc(insta)}</strong></div><button class="copy-btn" data-copy="${esc(insta)}" type="button">نسخ</button></div><div class="payment-method"><div class="method-icon vodafone">V</div><div><h3>Vodafone Cash</h3><p>حوّل إلى الرقم التالي</p><strong dir="ltr">${esc(phone)}</strong></div><button class="copy-btn" data-copy="${esc(phone)}" type="button">نسخ</button></div><a class="button primary full" href="https://wa.me/${esc(wa)}?text=${message}" target="_blank" rel="noopener">إرسال الإيصال على واتساب ↗</a><p class="tiny-note">إرسال الإيصال لا يعني قبول الدفع تلقائيًا. لا تشارك كلمات المرور أو أرقام PIN أو رموز OTP.</p></section></div><a class="text-link" href="/my-courses">العودة إلى كورساتي ←</a>`);
});
app.get("/register",(req,res)=>page(req,res,"إنشاء حساب",`<section class="auth-wrap"><div class="auth-aside"><span class="eyebrow">ابدأ رحلتك</span><h1>كل مهارة جديدة<br>تفتح بابًا.</h1><p>أنشئ حسابك لتتابع كورساتك وطلبات الاشتراك في مكان واحد.</p></div><form class="panel auth-form" method="post" action="/register"><h2>حساب جديد</h2>${req.query.error?flash(req.query.error,"error"):""}<label>الاسم الكامل<input name="name" required maxlength="80" autocomplete="name"></label><label>البريد الإلكتروني<input name="email" type="email" required maxlength="160" autocomplete="email"></label><label>كلمة المرور<input name="password" type="password" required minlength="10" autocomplete="new-password"><small>10 أحرف على الأقل.</small></label><button class="button primary full">إنشاء الحساب</button><p class="muted">لديك حساب؟ <a href="/login">سجّل الدخول</a></p></form></section>`));
app.post("/register",(req,res)=>{
 const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 if(name.length<2||name.length>80||!email.includes("@")||password.length<10)return res.redirect("/register?error="+encodeURIComponent("راجع البيانات. كلمة المرور يجب ألا تقل عن 10 أحرف."));
 try{const hash=bcrypt.hashSync(password,12);const r=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'student')").run(name,email,hash);req.session.user={id:r.lastInsertRowid,name,email,role:"student"};res.redirect("/courses");}
 catch(e){res.redirect("/register?error="+encodeURIComponent("البريد الإلكتروني مستخدم بالفعل."));}
});
app.get("/login",(req,res)=>page(req,res,"تسجيل الدخول",`<section class="auth-wrap"><div class="auth-aside"><span class="eyebrow">مرحبًا بعودتك</span><h1>كمّل من حيث<br>توقفت.</h1><p>كل ما تحتاجه لمتابعة رحلتك التعليمية في مكان واحد.</p></div><form class="panel auth-form" method="post" action="/login"><h2>تسجيل الدخول</h2>${req.query.error?flash("بيانات الدخول غير صحيحة.","error"):""}<label>البريد الإلكتروني<input name="email" type="email" required autocomplete="username"></label><label>كلمة المرور<input name="password" type="password" required autocomplete="current-password"></label><button class="button primary full">دخول</button><p class="muted">ليس لديك حساب؟ <a href="/register">أنشئ حسابًا</a></p></form></section>`));
app.post("/login",(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 const u=db.prepare("SELECT * FROM users WHERE email=?").get(email);
 if(!u||!bcrypt.compareSync(password,u.password_hash))return res.redirect("/login?error=1");
 req.session.regenerate(err=>{if(err)return res.redirect("/login?error=1");req.session.user={id:u.id,name:u.name,email:u.email,role:u.role};res.redirect(u.role==="admin"?"/admin":"/courses");});
});
app.post("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/")));
app.get("/my-courses",requireLogin,(req,res)=>{
 const rows=db.prepare("SELECT c.*,e.status FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? ORDER BY e.id DESC").all(user(req).id);
 page(req,res,"كورساتي",`<section class="page-head"><span class="eyebrow">مساحتك التعليمية</span><h1>كورساتي</h1><p>تابع حالة الاشتراك وافتح الكورسات التي تم تفعيلها.</p></section><div class="course-grid">${rows.map(c=>`<article class="course-card"><div class="course-info"><div class="course-meta"><span>${esc(c.subject)}</span><span class="status ${c.status}">${c.status==="approved"?"مفعّل":c.status==="pending"?"قيد المراجعة":"مرفوض"}</span></div><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><div class="course-bottom"><strong>${money(c.price_egp)} ج.م</strong><a class="small-link" href="${c.status==="approved"?`/courses/${c.id}`:`/payment-info/${c.id}`}">${c.status==="approved"?"فتح الكورس":"بيانات الدفع"} ←</a></div></div></article>`).join("")||'<div class="empty-state">لم تشترك في كورس بعد. <a href="/courses">استكشف الكورسات</a></div>'}</div>`);
});
app.get("/admin",requireAdmin,(req,res)=>{
 const courses=db.prepare("SELECT c.*,COUNT(DISTINCT e.id) AS enroll_count FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id GROUP BY c.id ORDER BY c.id DESC").all();
 const enrollments=db.prepare("SELECT e.*,u.name AS student_name,u.email,c.title AS course_title,c.price_egp FROM enrollments e JOIN users u ON u.id=e.user_id JOIN courses c ON c.id=e.course_id ORDER BY CASE e.status WHEN 'pending' THEN 0 ELSE 1 END,e.id DESC").all();
 const students=db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='student'").get().n;
 page(req,res,"لوحة الإدارة",`<section class="page-head"><span class="eyebrow">مساحة الإدارة</span><h1>لوحة التحكم</h1><p>إدارة الكورسات ومراجعة طلبات الاشتراك يدويًا.</p></section><div class="stats-grid"><div class="stat-card"><span>الكورسات</span><strong>${courses.length}</strong></div><div class="stat-card"><span>الطلاب</span><strong>${students}</strong></div><div class="stat-card"><span>طلبات قيد المراجعة</span><strong>${enrollments.filter(e=>e.status==="pending").length}</strong></div></div>
 <section class="panel admin-section"><h2>إضافة كورس</h2><form class="admin-course-form" method="post" action="/admin/courses"><label>اسم الكورس<input name="title" required maxlength="160"></label><label>المادة<input name="subject" required maxlength="80" placeholder="مثال: كيمياء"></label><label>السعر بالجنيه<input name="price_egp" type="number" min="0" max="1000000" required></label><label>اسم المدرس<input name="instructor" maxlength="100"></label><label class="wide">وصف الكورس<textarea name="description" rows="2" maxlength="1000"></textarea></label><button class="button primary">إضافة الكورس</button></form></section>
 <section class="panel admin-section"><h2>طلبات الاشتراك</h2><div class="table-wrap"><table><thead><tr><th>الطالب</th><th>الكورس</th><th>المبلغ</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${enrollments.map(e=>`<tr><td>${esc(e.student_name)}<small>${esc(e.email)}</small></td><td>${esc(e.course_title)}</td><td>${money(e.price_egp)} ج.م</td><td><span class="status ${e.status}">${e.status==="pending"?"قيد المراجعة":e.status==="approved"?"مقبول":"مرفوض"}</span></td><td>${e.status==="pending"?`<form class="inline" method="post" action="/admin/enrollments/${e.id}"><button class="mini-button approve" name="status" value="approved">تفعيل بعد التحقق</button><button class="mini-button reject" name="status" value="rejected">رفض</button></form>`:"—"}</td></tr>`).join("")||'<tr><td colspan="5">لا توجد طلبات بعد.</td></tr>'}</tbody></table></div><p class="tiny-note">لا تضغط «تفعيل» إلا بعد التأكد من وصول المبلغ فعليًا إلى حسابك.</p></section>
 <section class="panel admin-section"><h2>إضافة درس إلى كورس</h2><form class="admin-course-form" method="post" action="/admin/lessons"><label>الكورس<select name="course_id" required>${courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join("")}</select></label><label>عنوان الدرس<input name="title" required maxlength="160"></label><label>ترتيب الدرس<input name="sort_order" type="number" min="0" value="0"></label><label>رابط فيديو اختياري<input name="video_url" type="url" placeholder="https://..."></label><label class="wide">ملخص الدرس<textarea name="body" rows="3" maxlength="5000"></textarea></label><button class="button primary">إضافة الدرس</button></form><p class="tiny-note">في النسخة الأولية يتم إدخال رابط الفيديو؛ لا ترفع ملفات فيديو كبيرة على نفس الخادم.</p></section>`);
});
app.post("/admin/courses",requireAdmin,(req,res)=>{
 const title=String(req.body.title||"").trim(),subject=String(req.body.subject||"").trim(),description=String(req.body.description||"").trim(),instructor=String(req.body.instructor||"").trim(),price=Number(req.body.price_egp);
 if(!title||!subject||!Number.isInteger(price)||price<0||price>1000000)return res.redirect("/admin");
 db.prepare("INSERT INTO courses(title,subject,description,price_egp,instructor,published) VALUES(?,?,?,?,?,1)").run(title,subject,description,price,instructor||user(req).name);
 res.redirect("/admin");
});
app.post("/admin/lessons",requireAdmin,(req,res)=>{
 const courseId=Number(req.body.course_id),title=String(req.body.title||"").trim(),body=String(req.body.body||"").trim(),video=String(req.body.video_url||"").trim(),order=Number(req.body.sort_order||0);
 if(!db.prepare("SELECT id FROM courses WHERE id=?").get(courseId)||!title||!Number.isInteger(order)||order<0|| (video&&!/^https?:\/\//i.test(video)))return res.redirect("/admin");
 db.prepare("INSERT INTO lessons(course_id,title,body,video_url,sort_order) VALUES(?,?,?,?,?)").run(courseId,title,body,video,order);
 res.redirect("/admin");
});
app.post("/admin/enrollments/:id",requireAdmin,(req,res)=>{
 const status=String(req.body.status||"");
 if(!["approved","rejected"].includes(status))return res.redirect("/admin");
 db.prepare("UPDATE enrollments SET status=? WHERE id=?").run(status,Number(req.params.id));
 res.redirect("/admin");
});
app.use((req,res)=>page(req,res,"غير موجود",`<section class="empty-state"><h1>الصفحة غير موجودة</h1><a href="/">العودة للرئيسية</a></section>`,404));
app.use((err,req,res,next)=>{console.error(err);res.status(500).send(layout(req,"خطأ",`<section class="empty-state"><h1>حدث خطأ غير متوقع</h1><p>حاول مرة أخرى. لم يتم عرض تفاصيل تقنية حساسة.</p><a href="/">الرئيسية</a></section>`));});
app.listen(PORT,()=>console.log(`${SITE} تعمل على http://localhost:${PORT}`));
