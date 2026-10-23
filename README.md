# Tênis de Mesa Ratings

Static player rating explorer and public data, hosted on GitHub Pages.

## Run locally

From this directory, serve the site over HTTP because it loads JSON with `fetch`:

```sh
python -m http.server 8000
```

Open <http://localhost:8000/>.

## Deploy to GitHub Pages with `tenisdemesa.thiagoa.com`

1. Create a new GitHub repository and push this directory to its `main` branch. The root already contains the site files and `CNAME` for `tenisdemesa.thiagoa.com`.
2. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
3. At your DNS provider, add this record:

   | Type | Name / Host | Target |
   |---|---|---|
   | CNAME | `tenisdemesa` | `<your-github-username>.github.io` |

   Replace the target with the GitHub Pages hostname for your account (not the repository name). Remove any conflicting DNS record for `tenisdemesa` first.
4. In **Settings → Pages → Custom domain**, enter `tenisdemesa.thiagoa.com` if GitHub has not filled it from `CNAME`. Wait for DNS verification, then enable **Enforce HTTPS**.
5. Wait for the Pages deployment and open <https://tenisdemesa.thiagoa.com>.

DNS propagation and GitHub's certificate provisioning can take time. The DNS record must point to the GitHub Pages hostname; keep the `CNAME` file in the published root.

## Data and analytics

`site-data.json` lists the estimate files shown by the explorer. The required estimate and rating history JSON files are included under `data/`. Update the manifest when publishing additional estimates.

Cloudflare Web Analytics is configured in `site-config.json`. Its beacon token is public client-side configuration; the site loads the beacon when the provider and token are set. Cloudflare Web Analytics does not require moving DNS or proxying this GitHub Pages site.
