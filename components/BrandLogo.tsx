type BrandLogoTone = "auto" | "light" | "dark";

type BrandLogoProps = {
  tone?: BrandLogoTone;
  className?: string;
};

const LOGO_VERSION = "20261127c";

const logoSource = (tone: Exclude<BrandLogoTone, "auto">) =>
  `/logo/${tone === "dark" ? "black1-spaced" : "light1-spaced"}.png?v=${LOGO_VERSION}`;

export default function BrandLogo({ tone = "auto", className = "" }: BrandLogoProps) {
  const imageClassName = ["shrink-0 object-contain", className].filter(Boolean).join(" ");

  if (tone !== "auto") {
    return (
      <img
        src={logoSource(tone)}
        alt=""
        aria-hidden="true"
        className={`block ${imageClassName}`}
        draggable={false}
      />
    );
  }

  return (
    <>
      <img
        src={logoSource("light")}
        alt=""
        aria-hidden="true"
        className={`block ${imageClassName} dark:hidden`}
        draggable={false}
      />
      <img
        src={logoSource("dark")}
        alt=""
        aria-hidden="true"
        className={`${imageClassName} hidden dark:block`}
        draggable={false}
      />
    </>
  );
}
