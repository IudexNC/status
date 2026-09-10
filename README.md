# iudexnc status page

Public availability page for the Iudex Non Calculat platform: https://iudexnc.github.io/status/

A scheduled GitHub Actions workflow (`.github/workflows/status.yml`, every 10 minutes) runs
`check.mjs`, which probes the web application, the API health endpoint and the website, appends
the result to `data/history.json` (rolling 30 days) and renders `site/index.html`. The page is
published with GitHub Pages from the workflow; no external service, token or dependency is used.

Services and expected responses are the `SERVICES` table at the top of `check.mjs`. An "incident"
on the page is any contiguous run of failed checks; there is no manual incident editor by design.

Maintained for the ISO 27001 / Vanta evidence request "Application status page".
