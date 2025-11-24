# Domain Setup Guide

## Step 1: Deploy Your Website

Choose one of these hosting services (all free for static sites):

### Option A: Netlify (Recommended - Easiest)
1. Go to [netlify.com](https://netlify.com) and sign up/login
2. Drag and drop your entire project folder onto Netlify's dashboard
3. Your site will be live at a URL like `your-site-name.netlify.app`
4. Go to **Site settings** → **Domain management** → **Add custom domain**
5. Enter your domain name
6. Netlify will show you DNS records to add (see Step 2)

### Option B: Vercel
1. Install Vercel CLI: `npm i -g vercel`
2. In your project folder, run: `vercel`
3. Follow the prompts
4. Go to your project dashboard → **Settings** → **Domains**
5. Add your domain

### Option C: Cloudflare Pages
1. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. Create a new project and upload your files
3. Go to **Custom domains** → **Set up a custom domain**
4. Enter your domain

### Option D: GitHub Pages
1. Create a GitHub repository
2. Push your files to the repo
3. Go to **Settings** → **Pages**
4. Select your branch and save
5. Add your custom domain in the Pages settings

## Step 2: Configure DNS

After adding your domain in your hosting service, you need to configure DNS at your domain registrar:

### For Netlify:
- **A Record**: Point `@` to `75.2.60.5`
- **CNAME Record**: Point `www` to `your-site-name.netlify.app`
- OR use Netlify's nameservers (they'll provide these)

### For Vercel:
- **A Record**: Point `@` to `76.76.21.21`
- **CNAME Record**: Point `www` to `cname.vercel-dns.com`

### For Cloudflare Pages:
- If your domain is on Cloudflare, it's automatic
- Otherwise, add the CNAME record they provide

### For GitHub Pages:
- **A Records**: Point `@` to:
  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`
- **CNAME Record**: Point `www` to `your-username.github.io`

**Where to add DNS records:**
- Log into your domain registrar (where you bought the domain)
- Look for "DNS Management", "DNS Settings", or "Name Servers"
- Add the records shown above

## Step 3: Wait for DNS Propagation

DNS changes can take anywhere from a few minutes to 48 hours to propagate. Usually it's within 1-2 hours.

You can check if DNS has propagated at: [whatsmydns.net](https://whatsmydns.net)

## Step 4: SSL Certificate

Most hosting services (Netlify, Vercel, Cloudflare) automatically provide free SSL certificates once DNS is configured. This usually happens automatically within a few minutes to an hour.

## Quick Checklist

- [ ] Deploy site to hosting service
- [ ] Add custom domain in hosting dashboard
- [ ] Configure DNS records at domain registrar
- [ ] Wait for DNS propagation (check with whatsmydns.net)
- [ ] Verify SSL certificate is active (should be automatic)
- [ ] Test your site at your domain!

## Need Help?

- **Netlify Support**: [docs.netlify.com](https://docs.netlify.com)
- **Vercel Support**: [vercel.com/docs](https://vercel.com/docs)
- **Cloudflare Support**: [developers.cloudflare.com](https://developers.cloudflare.com)

