import { PublicHoroscopeView } from "@/components/public-horoscope-view";

export default function PublicHoroscopeLoading() {
  return <PublicHoroscopeView state={{ status: "loading" }} />;
}
