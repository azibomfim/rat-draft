import { ChampionIndex } from "./champion-id";
import { getChampions } from "./ddragon";

let indexPromise: Promise<ChampionIndex> | null = null;

/** Champion name/key lookup built from Data Dragon (English names + keys). */
export async function getChampionIndex(): Promise<ChampionIndex> {
  if (!indexPromise) {
    indexPromise = getChampions("en")
      .then((list) => new ChampionIndex(list))
      .catch((err: unknown) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}
