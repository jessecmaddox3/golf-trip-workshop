# Privacy and security

> **Quick take:** report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/jessecmaddox3/golf-trip-workshop/security/advisories/new). Use an invented reproduction. Do not post credentials, group details or working access links in a public issue.

This is a personal project without a guaranteed response time. Include the release version, operating mode, expected boundary and minimum synthetic steps to reproduce the problem.

Demo mode serves a wholly invented local event. Production gates the browser application and assets behind individual access links. The private registry stores token hashes and a private link directory; the generated HTML also contains working links. Both must remain outside browser assets and public source. Provider credentials belong only in the private environment.

The public/build path checks resolve filesystem aliases and compare file identities, including hard links to known private configuration/access/store files. The ZIP uses an explicit file allowlist. These controls do not recognize arbitrary personal text someone deliberately copies into a public source file or image. Review your exact public changes and archive before publishing an adaptation.

Operators manage HTTPS, host access, logs, persistent storage, backups and access revocation. Send every production path through the authenticated Node app, omit credential-bearing query strings from proxy logs, and do not publish a static production build. A session cookie lasts eight hours; rotating or revoking an identity invalidates its existing sessions.

Browser recovery journals and downloaded backups contain event data. Protect the computer account, shared browsers and exported files accordingly. Sign out on shared devices and close event tabs before changing accounts. This release does not provide encrypted-at-rest storage, a managed hosting service or automatic full-database migrations.
