import type { Metadata } from "next";
import EawaseGame from "./eawase-game";

export const metadata: Metadata = {
  title: "えあわせ | あそびのひろば",
  description: "カードを めくって おなじ どうぶつを みつけよう！",
};

export default function EawasePage() {
  return <EawaseGame />;
}
