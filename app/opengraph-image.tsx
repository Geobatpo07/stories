import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Root-level default — applies to every route that doesn't define its own
 * opengraph-image, per Next's segment-inheritance convention. A per-entity
 * dynamic OG image (using each story's/program's own title) would be a
 * further improvement, not attempted here.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f6f2",
        fontFamily: "Georgia, serif",
      }}
    >
      <div
        style={{
          width: 150,
          height: 150,
          borderRadius: "50%",
          border: "3px solid #18212b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontStyle: "italic",
          fontSize: 76,
          color: "#18212b",
          marginBottom: 40,
        }}
      >
        S
      </div>
      <div style={{ display: "flex", fontSize: 58, color: "#18212b" }}>{"Geo’s Stories"}</div>
      <div
        style={{
          display: "flex",
          marginTop: 16,
          fontSize: 26,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#66717d",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Research Laboratory
      </div>
    </div>,
    size,
  );
}
