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
        <p>This second paragraph continues the article with concrete detail, context, and a conclusion. It is readable static text intended for people rather than a collection of links, controls, cookie banners, or unrelated recommendations.</p>
      </article>
    </main>
    <footer>Privacy · Terms · Newsletter</footer>
  </body>
</html>`;

export const NO_ARTICLE = `<!doctype html>
<html><body><nav>Home · About · Contact</nav><footer>Copyright</footer></body></html>`;
