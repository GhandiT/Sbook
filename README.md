# Sara Land

A one-page personal book archive. Autumn palette, dark / light mode, book covers and descriptions pulled live from the [Open Library](https://openlibrary.org) API.

<!-- site made by A.t -->

## 1. Add your books

Open `books.txt` and write one English book title per line:

```
Pride and Prejudice
The Little Prince
1984 | George Orwell
```

- Optional: add the author after `|` to get a more accurate match.
- Empty lines and lines starting with `#` are ignored.

## 2. Publish on GitHub Pages

1. Create a new repository on GitHub (e.g. `sara-land`).
2. Upload **all files in this folder** (not the folder itself) so `index.html` is at the root.
3. Go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then Save.
4. After a minute your site is live at `https://<username>.github.io/<repo>/`.

Whenever you edit `books.txt` on GitHub, the site updates automatically.

## Test locally

Browsers block reading `books.txt` from a plain `file://` page, so use a tiny local server:

```
python3 -m http.server 8000
```

then open http://localhost:8000

## Files

```
index.html        page structure
css/style.css     theme, layout, animations
js/app.js         books.txt reader, Open Library API, modal, leaves
js/theme.js       applies dark / light before first paint
images/sara.jpg   background photo (replace with any image of your own)
books.txt         your book list (empty to start)
```

---

## راهنمای فارسی

۱. فایل `books.txt` را باز کن و اسم انگلیسی کتاب‌ها را هر کدوم در یک خط بنویس. (اختیاری: بعد از علامت `|` اسم نویسنده را بنویس تا کتاب دقیق‌تر پیدا شود.)

۲. همه‌ی فایل‌های داخل این پوشه را در یک ریپازیتوری گیت‌هاب آپلود کن (`index.html` باید در ریشه باشد).

۳. در **Settings → Pages** گزینه‌ی **Deploy from a branch** و شاخه‌ی `main` را انتخاب کن.

۴. بعد از چند لحظه سایت روی `github.io` بالا می‌آید.
