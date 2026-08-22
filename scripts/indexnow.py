#!/usr/bin/env python3
"""Push the sitemap's URLs to IndexNow so Bing crawls them now rather than
whenever it next gets round to the site.

    python scripts/indexnow.py            # submit every URL in sitemap.xml
    python scripts/indexnow.py --dry-run  # show what would be sent
    python scripts/indexnow.py <url> ...  # submit specific URLs

IndexNow is a shared endpoint: one submission reaches Bing, Yandex, Seznam and
Naver. Google does not participate — for Google the route is Search Console.

Ownership is proved by hosting a key file at the site root whose contents are
the key itself. The key lives in `.indexnow-key`; the file served publicly is
`<key>.txt`. Both are committed, which is fine — the key is not a secret. It
only proves that whoever submits URLs can also write to the site root, and the
worst a leak allows is someone asking Bing to re-crawl pages that are already
public.

Only submit URLs that return 200. Sending redirects or 404s is what gets a key
throttled, so the script checks every URL first and refuses to send bad ones
unless told otherwise.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

HOST = 'twinanalytic.com'
ENDPOINT = 'https://api.indexnow.org/indexnow'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (compatible; twinanalytic-indexnow/1.0)'


def read_key():
    path = os.path.join(ROOT, '.indexnow-key')
    if not os.path.exists(path):
        sys.exit("No .indexnow-key found. Generate one and host <key>.txt at the site root.")
    return open(path, encoding='utf-8').read().strip()


def sitemap_urls():
    xml = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
    return re.findall(r'<loc>([^<]+)</loc>', xml)


def status(url):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
    try:
        # Do not follow redirects: a 3xx here means the sitemap points at a URL
        # that is not the final one, which is exactly what we must not submit.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k): return None
        opener = urllib.request.build_opener(NoRedirect)
        return opener.open(req, timeout=20).status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return f'ERR {e}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('urls', nargs='*', help='specific URLs (default: all in sitemap.xml)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--skip-check', action='store_true',
                    help='submit without verifying each URL returns 200')
    args = ap.parse_args()

    key = read_key()
    urls = args.urls or sitemap_urls()
    if not urls:
        sys.exit('No URLs to submit.')

    # The key file has to be live before any submission is accepted.
    key_url = f'https://{HOST}/{key}.txt'
    if not args.dry_run:
        st = status(key_url)
        if st != 200:
            sys.exit(f"Key file is not live yet ({key_url} -> {st}).\n"
                     f"Deploy first, then rerun.")
        print(f"key file verified: {key_url} -> 200")

    if not args.skip_check:
        bad = []
        for u in urls:
            st = status(u)
            if st != 200:
                bad.append((u, st))
        if bad:
            print(f"\n{len(bad)} URL(s) do not return 200 — not submitting:")
            for u, st in bad:
                print(f"   {st}  {u}")
            print("\nFix these or rerun with --skip-check.")
            return 1
        print(f"all {len(urls)} URLs return 200")

    payload = {'host': HOST, 'key': key, 'keyLocation': key_url, 'urlList': urls}

    if args.dry_run:
        print(json.dumps(payload, indent=2)[:1200])
        print(f"\n[dry run] would submit {len(urls)} URLs")
        return 0

    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode('utf-8'), method='POST',
        headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode('utf-8', 'replace').strip()
            print(f"\nHTTP {r.status} {r.reason}  {body}")
    except urllib.error.HTTPError as e:
        print(f"\nHTTP {e.code}: {e.read().decode('utf-8','replace')[:400]}")
        # 202 is success; 400/403/422 mean key or host problems worth surfacing.
        return 1

    print(f"submitted {len(urls)} URLs for {HOST}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
