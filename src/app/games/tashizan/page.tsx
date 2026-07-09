import type { Metadata } from "next";
import TashizanGame from "./tashizan-game";

export const metadata: Metadata = {
  title: "たしざん | あそびのひろば",
  description: "こたえを えらんで たしざんの れんしゅう！",
};

export default function TashizanPage() {
  return <TashizanGame />;
}
