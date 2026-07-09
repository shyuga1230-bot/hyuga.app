import type { Metadata } from "next";
import MoguraGame from "./mogura-game";

export const metadata: Metadata = {
  title: "もぐらたたき | あそびのひろば",
  description: "でてきた もぐらを タッチして とくてんを かせごう！",
};

export default function MoguraPage() {
  return <MoguraGame />;
}
