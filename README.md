# Vertical FX List for REAPER – Product Page

Single-page, responsive site to sell your REAPER Vertical FX List script. Includes hero, features (grid + text/GIF rows), demo, how it works, requirements, installation, pricing with buy buttons, testimonials, FAQ, contact, SEO/OG tags, and structured data.

## Quick start

1. Open `index.html` in a browser to preview.
2. Edit content in `index.html` (titles, copy, FAQ, etc.).
3. Customize colors or spacing in `styles.css`.
4. Set your checkout link on Buy buttons via the `data-payment-link` attribute in `index.html`.
5. Deploy to a static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.).

## Checkout setup

- Stripe: Create a Payment Link and paste its URL into both `data-payment-link` attributes on `#buyButton` and `#buyButtonPricing`.
- Lemon Squeezy / Paddle / Gumroad: Use their hosted checkout link similarly.

## Demo section

- Replace the YouTube iframe `src` with your video or set the `data-youtube-id` attribute.
- Optionally add an MP3 in the audio example.

## SEO

- Update `<title>`, meta description, Open Graph, and Twitter tags in `index.html`.
- Replace the `og:image` URL with your own 1200x630 image.
- Update JSON-LD structured data: name, brand, sku, price, and URLs.

## Branding

- Change the site name in the header brand link.
- Update footer name and support email.

## Deploy

- Netlify: Drag-and-drop the folder, or `netlify deploy`.
- Vercel: `vercel` in this folder.
- GitHub Pages: Push to a repo and enable Pages for main branch.

## License

You own your content. The template code is provided under the MIT License.


## Feature rows (text + video)

- Add detailed sections under the Features area using the `.feature-rows` markup in `index.html`.
- Each row has a `.feature-text` column and a `.feature-media` column that accepts .mov or .mp4 videos.
- To reverse the layout, add the `reverse` class to `.feature-row`.
- Place your media files in organized subfolders within `assets/`:
  - Videos: `assets/Videos/` (e.g., `./assets/Videos/Main-basic.mov`)
  - Icons: `assets/icons/` (e.g., `./assets/icons/MouseL.png`)
  - Background images: `assets/Bg pics/` (e.g., `./assets/Bg pics/BG5.png`)
- Videos autoplay on loop, are muted by default, and don't show controls for a cleaner presentation.
- Hero section includes a background video (`./assets/Videos/Main-basic.mov`) that plays behind the text content.


