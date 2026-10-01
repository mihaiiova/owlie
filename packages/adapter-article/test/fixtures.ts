export const CLEAN_ARTICLE = `<!doctype html>
<html>
  <head>
    <title>A useful article title</title>
    <meta name="author" content="Avery Writer" />
    <meta property="article:published_time" content="2025-08-19T10:00:00Z" />
  </head>
  <body>
    <nav>Subscribe · Account · Categories</nav>
    <main>
      <article>
        <h1>A useful article title</h1>
        <p>This is a deliberately substantial first paragraph of editorial prose. It explains the topic in ordinary language and contains enough independent words for article extraction to distinguish it from a navigation menu or decorative page chrome.</p>
        <p>This second paragraph continues the article with concrete detail, context, and a conclusion. It is readable static text intended for people rather than a collection of links &amp; controls, cookie banners, or unrelated recommendations.</p>
      </article>
    </main>
    <footer>Privacy · Terms · Newsletter</footer>
  </body>
</html>`;

export const NO_ARTICLE = `<!doctype html>
<html><body><nav>Home · About · Contact</nav><footer>Copyright</footer></body></html>`;

export const MALFORMED_ARTICLE = `<html><head><title>Malformed story</title></head><body><main><article><h1>Malformed story</h1><p>This deliberately unclosed paragraph has enough readable editorial detail to be extracted from malformed but static HTML. It continues with practical context, explanatory language, and a meaningful conclusion for a reader who needs the central point without any navigation or page chrome.<p>A second paragraph supplies additional complete sentences and enough text for the extractor to identify an article despite missing closing tags and an incomplete document structure.</article></main>`;

export const MAIN_WRAPPED_ARTICLE = `<!doctype html>
<html>
  <head>
    <title>Short update wrapped in main</title>
    <link rel="canonical" href="https://example.com/articles/short-update" />
    <meta property="og:type" content="article" />
    <meta property="article:published_time" content="2025-08-19T10:00:00Z" />
  </head>
  <body>
    <header><nav>Home · Sections · Search</nav></header>
    <div class="container is-main">
      <main id="main">
        <div class="single-content">
          <div class="post-meta"><time datetime="2025-08-19T10:00:00Z">2025-08-19 @ 10:00</time></div>
          <div class="post-content">
            <p>A short update whose body lives inside a main element wrapped by a container div, mirroring editorial pages where Readability keeps the semantic wrapper. It explains the situation in ordinary prose.</p>
            <p>A second paragraph adds the concrete detail, context, and conclusion a reader needs, with enough independent words for extraction to distinguish the story from navigation, cookie banners, and unrelated recommendations.</p>
          </div>
        </div>
      </main>
    </div>
    <p>This site uses cookies to improve your experience. Accept · Reject</p>
  </body>
</html>`;

const LONG_BODY = `<p>${'This paragraph is part of a long-form static article with complete sentences, concrete detail, and enough independent words to be clearly editorial prose. '.repeat(4)}</p>
        <p>${'A further paragraph extends the argument with context, examples, and a conclusion, so the readable body is long enough to count as an article by itself. '.repeat(4)}</p>`;

export const JSON_LD_GRAPH_ARTICLE = `<!doctype html>
<html>
  <head>
    <title>Declared through JSON-LD</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Example"},{"@type":["NewsArticle"],"headline":"Declared through JSON-LD"}]}</script>
  </head>
  <body><main><article><h1>Declared through JSON-LD</h1><p>A short but real news story body with a few complete sentences for the reader. It explains what happened, who was involved, and why it matters to the people affected.</p><p>A second paragraph gives the outcome and what comes next, in plain editorial prose.</p></article></main></body>
</html>`;

export const MALFORMED_JSON_LD_ARTICLE = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">{ not json</script>
    <script type="application/ld+json">{"@type":"BlogPosting"}</script>
  </head>
  <body><article><p>A short blog post body with a couple of complete sentences so the extractor has readable text to return.</p></article></body>
</html>`;

export const UNDECLARED_LONG_ARTICLE = `<!doctype html>
<html>
  <head><title>An undeclared long read</title></head>
  <body><main><article><h1>An undeclared long read</h1>
        ${LONG_BODY}
  </article></main></body>
</html>`;

export const WEBSITE_HOMEPAGE = `<!doctype html>
<html>
  <head>
    <title>Example Publication</title>
    <meta content="website" property="og:type" />
    <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
  </head>
  <body><main>
        ${LONG_BODY}
  </main></body>
</html>`;
