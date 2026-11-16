# SlideCraft AI — 100% Native Netlify Edition (24/7 Live)

## Deploy on Netlify in 3 Minutes
1. Push all files inside this folder (`index.html`, `style.css`, `app.js`, `pptx_builder.js`, `netlify.toml`, `package.json`, and the `netlify/` folder) to a GitHub repository.
2. Go to **app.netlify.com** → **Add new site** → **Import an existing project** → connect your GitHub repository.
3. Netlify will automatically detect `netlify.toml` and `netlify/functions/`.
4. Before or after clicking Deploy, go to **Site configuration → Environment variables** and add:
   - `GEMINI_API_KEY` = *your Gemini API key*
   - *(Optional)* `APP_PASSWORD` = *a password to protect your site*
5. Trigger a redeploy if you added the API key after the first build — your website is now live 24/7!
