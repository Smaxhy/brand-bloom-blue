import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import siteHtml from "../inspirova.html?raw";
import resultsHtml from "../results.html?raw";
import proof1 from "@/assets/results/proof-01.webp";
import proof2 from "@/assets/results/proof-02.webp";
import proof3 from "@/assets/results/proof-03.webp";
import proof4 from "@/assets/results/proof-04.webp";
import proof5 from "@/assets/results/proof-05.webp";
import proof6 from "@/assets/results/proof-06.webp";
import proof7 from "@/assets/results/proof-07.webp";
import proof8 from "@/assets/results/proof-08.webp";
import proof9 from "@/assets/results/proof-09.webp";
import proof10 from "@/assets/results/proof-10.webp";
import proof11 from "@/assets/results/proof-11.webp";
import proof12 from "@/assets/results/proof-12.webp";

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "$1M+ in tracked client revenue — Inspirova Marketing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "$1,037,785 in verified client revenue tracked across Shopify, Meta Ads and GHL dashboards. Real screenshots, real numbers, real brands.",
      },
      { property: "og:title", content: "$1,037,785 generated for clients — Inspirova" },
      {
        property: "og:description",
        content:
          "A 7-figure milestone, screenshotted straight from client dashboards. See the receipts.",
      },
    ],
  }),
  component: ResultsPage,
});

const proofs: Record<string, string> = {
  __PROOF_01__: proof1,
  __PROOF_02__: proof2,
  __PROOF_03__: proof3,
  __PROOF_04__: proof4,
  __PROOF_05__: proof5,
  __PROOF_06__: proof6,
  __PROOF_07__: proof7,
  __PROOF_08__: proof8,
  __PROOF_09__: proof9,
  __PROOF_10__: proof10,
  __PROOF_11__: proof11,
  __PROOF_12__: proof12,
};

// The results page uses the homepage's own stylesheet (the first <style> block
// of inspirova.html), so its header, buttons, cards and footer always match.
const styleStart = siteHtml.indexOf("<style>") + "<style>".length;
const siteCss = siteHtml.slice(styleStart, siteHtml.indexOf("</style>", styleStart));

const renderedHtml = Object.entries(proofs)
  .reduce(
    (html, [token, url]) => html.replaceAll(token, url),
    resultsHtml.replace("/*__SITE_CSS__*/", () => siteCss),
  )
  .replace(
    "</body>",
    `<script>
      document.querySelectorAll('a[href^="#"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
          var target = document.getElementById(link.getAttribute('href').slice(1));
          if (target) { event.preventDefault(); target.scrollIntoView({ block: 'start' }); }
        });
      });
      // Links back to the homepage (and /admin, /privacy) open in the main window.
      // target="_top" on the anchors is the fallback without JavaScript.
      document.querySelectorAll('a[href^="/"]').forEach(function(link) {
        var path = link.getAttribute('href');
        link.addEventListener('click', function(event) {
          event.preventDefault();
          try { window.top.location.assign(path); }
          catch (e) { window.parent.postMessage({ type: 'inspirova:navigate', path: path }, '*'); }
        });
      });
    </script></body>`,
  );

const homeAnchors = ["services", "how", "pricing", "faq", "contact", "quoteForm"];

function ResultsPage() {
  const frame = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate({ from: "/results" });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "inspirova:navigate"
      )
        return;
      const path = event.data.path;
      if (typeof path !== "string") return;
      if (path === "/" || path === "/admin" || path === "/privacy") {
        navigate({ to: path });
      } else if (path.startsWith("/#") && homeAnchors.includes(path.slice(2))) {
        navigate({ to: "/", hash: path.slice(2) });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigate]);

  return (
    <iframe
      ref={frame}
      title="Inspirova results"
      id="main-content"
      srcDoc={renderedHtml}
      className="block h-screen w-px min-w-full max-w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
    />
  );
}
