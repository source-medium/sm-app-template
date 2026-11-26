import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssetVideo, youtubeEmbedUrl } from "@/components/patterns/asset-video";

const EMBED = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
const PARAMS = "?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1";

describe("youtubeEmbedUrl", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ])("embeds %s without cookies", (link) => {
    expect(youtubeEmbedUrl(link)).toBe(`${EMBED}${PARAMS}`);
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com.example.com/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@channel",
    "https://cdn.example.com/clip.mp4",
    "not a url",
  ])("leaves %s to the native player", (link) => {
    expect(youtubeEmbedUrl(link)).toBeNull();
  });
});

describe("AssetVideo", () => {
  it("plays a YouTube link in the privacy-enhanced embed, sending only the origin", () => {
    render(
      <AssetVideo
        src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        poster="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
        label="Spring launch"
        fallback={<span>Fallback</span>}
        className="aspect-video"
      />,
    );
    // Nothing loads from YouTube until Play.
    expect(document.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play Spring launch" }));

    const player = screen.getByTitle("Spring launch");
    expect(player.tagName).toBe("IFRAME");
    expect(player).toHaveAttribute("src", `${EMBED}${PARAMS}`);
    expect(player).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    expect(player).toHaveAttribute("allow", expect.stringContaining("autoplay"));
    expect(player).toHaveFocus();
    expect(document.querySelector("video")).toBeNull();
  });

  it("plays any other URL in the native player", () => {
    render(
      <AssetVideo
        src="https://cdn.example.com/clip.mp4"
        poster={null}
        label="Clip"
        fallback={<span>Fallback</span>}
        className="aspect-video"
      />,
    );
    // jsdom never focuses a <video>, though a browser does one with controls; check it is asked to.
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    fireEvent.click(screen.getByRole("button", { name: "Play Clip" }));
    const player = screen.getByLabelText("Clip");
    expect(player.tagName).toBe("VIDEO");
    expect(player).toHaveAttribute("src", "https://cdn.example.com/clip.mp4");
    expect(focus.mock.contexts).toContain(player);
    focus.mockRestore();
    expect(document.querySelector("iframe")).toBeNull();
  });
});
