-- =============================================================================
-- LearnPhish Seed Data
-- Run AFTER schema.sql:  psql -U postgres -d LearnPhish -f seed.sql
-- =============================================================================

-- =============================================================================
-- 1. Brands
-- =============================================================================
INSERT INTO brands (name, display_name, category) VALUES
    -- Finance
    ('paypal',           'PayPal',            'finance'),
    ('chase',            'Chase',             'finance'),
    ('wellsfargo',       'Wells Fargo',        'finance'),
    ('bankofamerica',    'Bank of America',    'finance'),
    ('citibank',         'Citibank',           'finance'),
    ('hsbc',             'HSBC',              'finance'),
    ('barclays',         'Barclays',          'finance'),
    ('lloyds',           'Lloyds Bank',       'finance'),
    ('santander',        'Santander',         'finance'),
    ('capitalone',       'Capital One',       'finance'),
    ('americanexpress',  'American Express',  'finance'),
    ('amex',             'Amex',              'finance'),
    ('mastercard',       'Mastercard',        'finance'),
    ('visa',             'Visa',              'finance'),
    ('stripe',           'Stripe',            'finance'),
    ('usbank',           'U.S. Bank',         'finance'),
    ('commerzbank',      'Commerzbank',       'finance'),
    ('deutschebank',     'Deutsche Bank',     'finance'),
    ('rabobank',         'Rabobank',          'finance'),
    ('ing',              'ING',               'finance'),
    -- Big Tech
    ('google',           'Google',            'tech'),
    ('microsoft',        'Microsoft',         'tech'),
    ('apple',            'Apple',             'tech'),
    ('amazon',           'Amazon',            'tech'),
    ('facebook',         'Facebook',          'tech'),
    ('meta',             'Meta',              'tech'),
    ('instagram',        'Instagram',         'tech'),
    ('twitter',          'Twitter / X',       'tech'),
    ('linkedin',         'LinkedIn',          'tech'),
    ('youtube',          'YouTube',           'tech'),
    ('tiktok',           'TikTok',            'tech'),
    ('snapchat',         'Snapchat',          'tech'),
    ('whatsapp',         'WhatsApp',          'tech'),
    ('telegram',         'Telegram',          'tech'),
    ('discord',          'Discord',           'tech'),
    ('reddit',           'Reddit',            'tech'),
    ('pinterest',        'Pinterest',         'tech'),
    ('netflix',          'Netflix',           'tech'),
    ('spotify',          'Spotify',           'tech'),
    ('twitch',           'Twitch',            'tech'),
    ('dropbox',          'Dropbox',           'tech'),
    ('icloud',           'iCloud',            'tech'),
    ('onedrive',         'OneDrive',          'tech'),
    ('sharepoint',       'SharePoint',        'tech'),
    ('github',           'GitHub',            'tech'),
    ('gitlab',           'GitLab',            'tech'),
    ('bitbucket',        'Bitbucket',         'tech'),
    ('adobe',            'Adobe',             'tech'),
    ('docusign',         'DocuSign',          'tech'),
    ('salesforce',       'Salesforce',        'tech'),
    ('zoom',             'Zoom',              'tech'),
    -- E-commerce / Delivery
    ('ebay',             'eBay',              'ecommerce'),
    ('alibaba',          'Alibaba',           'ecommerce'),
    ('aliexpress',       'AliExpress',        'ecommerce'),
    ('shopify',          'Shopify',           'ecommerce'),
    ('walmart',          'Walmart',           'ecommerce'),
    ('target',           'Target',            'ecommerce'),
    ('bestbuy',          'Best Buy',          'ecommerce'),
    ('fedex',            'FedEx',             'ecommerce'),
    ('ups',              'UPS',               'ecommerce'),
    ('dhl',              'DHL',               'ecommerce'),
    ('usps',             'USPS',              'ecommerce'),
    -- Telco / Infra
    ('att',              'AT&T',              'telco'),
    ('verizon',          'Verizon',           'telco'),
    ('tmobile',          'T-Mobile',          'telco'),
    ('comcast',          'Comcast',           'telco'),
    ('vodafone',         'Vodafone',          'telco'),
    ('cloudflare',       'Cloudflare',        'telco'),
    ('godaddy',          'GoDaddy',           'telco'),
    -- Gov
    ('irs',              'IRS',               'gov'),
    ('hmrc',             'HMRC',              'gov'),
    ('medicare',         'Medicare',          'gov'),
    -- Email / Workspace
    ('gmail',            'Gmail',             'email'),
    ('outlook',          'Outlook',           'email'),
    ('yahoo',            'Yahoo',             'email'),
    ('protonmail',       'ProtonMail',        'email'),
    ('zoho',             'Zoho',              'email'),
    -- Crypto
    ('coinbase',         'Coinbase',          'crypto'),
    ('binance',          'Binance',           'crypto'),
    ('kraken',           'Kraken',            'crypto'),
    ('metamask',         'MetaMask',          'crypto'),
    ('ledger',           'Ledger',            'crypto'),
    -- Security
    ('norton',           'Norton',            'tech'),
    ('mcafee',           'McAfee',            'tech'),
    ('avast',            'Avast',             'tech'),
    ('bitdefender',      'Bitdefender',       'tech')
ON CONFLICT (name) DO NOTHING;


-- =============================================================================
-- 2. Brand Domains  (official domains → always whitelisted via brand_domains)
-- =============================================================================
INSERT INTO brand_domains (brand_id, domain, is_primary)
SELECT b.id, d.domain, d.is_primary FROM brands b
JOIN (VALUES
    -- PayPal
    ('paypal', 'paypal.com',          TRUE),
    ('paypal', 'paypal.me',           FALSE),
    ('paypal', 'paypalobjects.com',   FALSE),
    -- Google
    ('google', 'google.com',          TRUE),
    ('google', 'google.co.uk',        FALSE),
    ('google', 'google.com.au',       FALSE),
    ('google', 'googleapis.com',      FALSE),
    ('google', 'googleusercontent.com', FALSE),
    ('google', 'goo.gl',              FALSE),
    -- Microsoft
    ('microsoft', 'microsoft.com',    TRUE),
    ('microsoft', 'microsoftonline.com', FALSE),
    ('microsoft', 'live.com',         FALSE),
    ('microsoft', 'hotmail.com',      FALSE),
    ('microsoft', 'outlook.com',      FALSE),
    ('microsoft', 'azure.com',        FALSE),
    ('microsoft', 'office.com',       FALSE),
    ('microsoft', 'office365.com',    FALSE),
    -- Apple
    ('apple', 'apple.com',            TRUE),
    ('apple', 'icloud.com',           FALSE),
    ('apple', 'me.com',               FALSE),
    ('apple', 'mac.com',              FALSE),
    -- Amazon
    ('amazon', 'amazon.com',          TRUE),
    ('amazon', 'amazon.co.uk',        FALSE),
    ('amazon', 'amazon.de',           FALSE),
    ('amazon', 'amazon.fr',           FALSE),
    ('amazon', 'amazonaws.com',       FALSE),
    ('amazon', 'amazonpay.com',       FALSE),
    -- Meta / Facebook
    ('facebook', 'facebook.com',      TRUE),
    ('facebook', 'fb.com',            FALSE),
    ('facebook', 'fbcdn.net',         FALSE),
    ('meta', 'meta.com',              TRUE),
    ('instagram', 'instagram.com',    TRUE),
    ('whatsapp', 'whatsapp.com',      TRUE),
    -- Twitter / X
    ('twitter', 'twitter.com',        TRUE),
    ('twitter', 'x.com',              FALSE),
    ('twitter', 't.co',               FALSE),
    -- LinkedIn
    ('linkedin', 'linkedin.com',      TRUE),
    ('linkedin', 'licdn.com',         FALSE),
    -- YouTube
    ('youtube', 'youtube.com',        TRUE),
    ('youtube', 'youtu.be',           FALSE),
    ('youtube', 'ytimg.com',          FALSE),
    -- Netflix
    ('netflix', 'netflix.com',        TRUE),
    ('netflix', 'nflxext.com',        FALSE),
    -- Spotify
    ('spotify', 'spotify.com',        TRUE),
    -- Dropbox
    ('dropbox', 'dropbox.com',        TRUE),
    ('dropbox', 'dropboxusercontent.com', FALSE),
    -- GitHub
    ('github', 'github.com',          TRUE),
    ('github', 'githubusercontent.com', FALSE),
    ('github', 'githubassets.com',    FALSE),
    -- GitLab
    ('gitlab', 'gitlab.com',          TRUE),
    -- Chase
    ('chase', 'chase.com',            TRUE),
    ('chase', 'jpmorganchase.com',    FALSE),
    -- Wells Fargo
    ('wellsfargo', 'wellsfargo.com',  TRUE),
    -- Bank of America
    ('bankofamerica', 'bankofamerica.com', TRUE),
    ('bankofamerica', 'bofa.com',          FALSE),
    -- Citibank
    ('citibank', 'citi.com',          TRUE),
    ('citibank', 'citibank.com',      FALSE),
    -- HSBC
    ('hsbc', 'hsbc.com',              TRUE),
    -- PayPal (Stripe)
    ('stripe', 'stripe.com',          TRUE),
    -- eBay
    ('ebay', 'ebay.com',              TRUE),
    ('ebay', 'ebay.co.uk',            FALSE),
    -- FedEx
    ('fedex', 'fedex.com',            TRUE),
    -- UPS
    ('ups', 'ups.com',                TRUE),
    -- DHL
    ('dhl', 'dhl.com',               TRUE),
    -- USPS
    ('usps', 'usps.com',              TRUE),
    -- Cloudflare
    ('cloudflare', 'cloudflare.com',  TRUE),
    ('cloudflare', 'cloudflareinsights.com', FALSE),
    -- Coinbase
    ('coinbase', 'coinbase.com',      TRUE),
    -- Binance
    ('binance', 'binance.com',        TRUE),
    -- Adobe
    ('adobe', 'adobe.com',            TRUE),
    ('adobe', 'adobecc.com',          FALSE),
    -- Zoom
    ('zoom', 'zoom.us',               TRUE),
    -- DocuSign
    ('docusign', 'docusign.com',      TRUE),
    -- Salesforce
    ('salesforce', 'salesforce.com',  TRUE),
    ('salesforce', 'force.com',       FALSE),
    -- ProtonMail
    ('protonmail', 'proton.me',       TRUE),
    ('protonmail', 'protonmail.com',  FALSE),
    -- Yahoo
    ('yahoo', 'yahoo.com',            TRUE),
    ('yahoo', 'yahoomail.com',        FALSE)
) AS d(brand_name, domain, is_primary) ON b.name = d.brand_name
ON CONFLICT (domain) DO NOTHING;


-- =============================================================================
-- 3. Domain Whitelist  (trusted domains that bypass all checks)
-- =============================================================================
INSERT INTO domain_whitelist (domain, added_by) VALUES
    ('google.com',              'seed'),
    ('bing.com',                'seed'),
    ('duckduckgo.com',          'seed'),
    ('cloudflare.com',          'seed'),
    ('amazonaws.com',           'seed'),
    ('fastly.com',              'seed'),
    ('akamai.com',              'seed'),
    ('cdn77.com',               'seed'),
    ('accounts.google.com',     'seed'),
    ('login.microsoftonline.com','seed'),
    ('auth0.com',               'seed'),
    ('okta.com',                'seed'),
    ('stripe.com',              'seed'),
    ('paypal.com',              'seed'),
    ('github.com',              'seed'),
    ('gitlab.com',              'seed'),
    ('stackoverflow.com',       'seed'),
    ('npmjs.com',               'seed'),
    ('pypi.org',                'seed'),
    ('bbc.com',                 'seed'),
    ('bbc.co.uk',               'seed'),
    ('reuters.com',             'seed'),
    ('apnews.com',              'seed'),
    ('wikipedia.org',           'seed'),
    ('arxiv.org',               'seed'),
    ('twitter.com',             'seed'),
    ('x.com',                   'seed'),
    ('linkedin.com',            'seed'),
    ('reddit.com',              'seed'),
    ('gov.my',                  'seed'),
    ('malaysia.gov.my',         'seed'),
    ('usa.gov',                 'seed'),
    ('gov.uk',                  'seed'),
    ('virustotal.com',          'seed'),
    ('shodan.io',               'seed')
ON CONFLICT (domain) DO NOTHING;


-- =============================================================================
-- 4. Domain Blacklist  (known phishing / malware domains)
-- =============================================================================
INSERT INTO domain_blacklist (domain, confidence, source) VALUES
    -- PayPal phishing patterns (example known-bad)
    ('paypal-secure-login.com',    0.99, 'manual'),
    ('paypal-verify.net',          0.99, 'manual'),
    ('paypal.com.login-now.info',  0.99, 'manual'),
    ('paypai-security.com',        0.98, 'manual'),
    ('paypa1.com',                 0.97, 'manual'),
    -- Microsoft phishing
    ('microsoft-account-alert.com', 0.99, 'manual'),
    ('microsoftonline-verify.com',  0.99, 'manual'),
    ('ms-office365-login.com',      0.98, 'manual'),
    -- Apple phishing
    ('apple-id-verify.com',        0.99, 'manual'),
    ('appleid-locked.com',         0.99, 'manual'),
    ('icloud-verify-account.com',  0.97, 'manual'),
    -- Amazon phishing
    ('amazon-security-alert.com',  0.99, 'manual'),
    ('amazon-account-update.net',  0.98, 'manual'),
    -- Banking
    ('chase-bank-secure.com',      0.99, 'manual'),
    ('wellsfargo-update.net',      0.99, 'manual'),
    ('bankofamerica-verify.com',   0.98, 'manual'),
    -- Crypto phishing
    ('coinbase-verify-wallet.com', 0.99, 'manual'),
    ('binance-security-update.com',0.99, 'manual'),
    ('metamask-restore.com',       0.99, 'manual'),
    -- Malware distribution
    ('malware-payload-drop.xyz',   1.00, 'manual'),
    ('ransomware-c2.top',          1.00, 'manual'),
    -- Generic phishing infrastructure
    ('login-secure-update.top',    0.95, 'manual'),
    ('account-verify-now.xyz',     0.95, 'manual'),
    ('secure-banking-login.gq',    0.96, 'manual'),
    ('update-your-info.ml',        0.95, 'manual')
ON CONFLICT (domain) DO NOTHING;
