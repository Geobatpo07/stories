import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f6f2",
        borderRadius: "50%",
        border: "2px solid #18212b",
        fontFamily: "Georgia, serif",
        fontStyle: "italic",
        fontSize: 20,
        color: "#18212b",
      }}
    >
      S
    </div>,
    size,
  );
}
