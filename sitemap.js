const { SitemapStream, streamToPromise } = require("sitemap");
const { createGzip } = require("zlib");
let sitemap;

const createSitemap = async (req, res) => {
  res.header("Content-Type", "application/xml");
  res.header("Content-Encoding", "gzip");
  res.header("Vary", "Accept-Encoding");
  if (sitemap) {
    res.send(sitemap);
    return;
  }

  try {
    const baseUrl = "https://example.com";

    const smStream = new SitemapStream({
      hostname: baseUrl,
    });
    const pipeline = smStream.pipe(createGzip());

    // Static pages
    data.forEach((page) => {
      smStream.write({
        url: new URL(page.url, baseUrl).href,
        changefreq: "daily",
        priority: page.priority,
      });
    });

    // // Dynamic pages, ex:
    // const berita = await getBerita();
    // berita.forEach((page) => {
    //   smStream.write({
    //     url: new URL(page.url, baseUrl).href,
    //     changefreq: "daily",
    //     priority: page.priority,
    //   });
    // });

    // Cache
    streamToPromise(pipeline).then((sm) => (sitemap = sm));

    smStream.end();
    pipeline.pipe(res).on("error", (e) => {
      throw e;
    });
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
};

const data = [{ url: "/", priority: 1.0 }];

module.exports = createSitemap;
