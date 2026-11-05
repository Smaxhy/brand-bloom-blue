/**
 * Big-area search support.
 *
 * Google Places returns at most 60 results per query *around one point*. For a
 * city that's fine; for "Arizona" the old code tiled a 60 km circle around the
 * state's geographic centre — empty desert — and came back with a hundred rows.
 *
 * This module turns a state (or any area wider than ~150 km) into a list of
 * sub-areas to search one by one: the state's biggest cities for the US (static,
 * instant, deterministic), or a coarse grid of points for anywhere else.
 */

export type SubArea = { label: string; lat?: number; lng?: number; radiusM?: number };

/** Cities per US state, biggest / most business-dense first. Suburbs included for the big metros. */
const US_STATE_CITIES: Record<string, { abbr: string; cities: string[] }> = {
  alabama: {
    abbr: "AL",
    cities: [
      "Birmingham",
      "Huntsville",
      "Montgomery",
      "Mobile",
      "Tuscaloosa",
      "Hoover",
      "Auburn",
      "Dothan",
    ],
  },
  alaska: { abbr: "AK", cities: ["Anchorage", "Fairbanks", "Juneau", "Wasilla"] },
  arizona: {
    abbr: "AZ",
    cities: [
      "Phoenix",
      "Scottsdale",
      "Mesa",
      "Tucson",
      "Chandler",
      "Gilbert",
      "Glendale",
      "Tempe",
      "Peoria",
      "Surprise",
      "Goodyear",
      "Flagstaff",
      "Prescott",
      "Yuma",
      "Queen Creek",
      "Casa Grande",
      "Lake Havasu City",
      "Sierra Vista",
    ],
  },
  arkansas: {
    abbr: "AR",
    cities: [
      "Little Rock",
      "Fayetteville",
      "Fort Smith",
      "Springdale",
      "Rogers",
      "Bentonville",
      "Jonesboro",
      "Conway",
    ],
  },
  california: {
    abbr: "CA",
    cities: [
      "Los Angeles",
      "San Diego",
      "San Jose",
      "San Francisco",
      "Sacramento",
      "Fresno",
      "Oakland",
      "Irvine",
      "Anaheim",
      "Riverside",
      "Bakersfield",
      "Santa Clarita",
      "Long Beach",
      "Santa Rosa",
      "Temecula",
      "Roseville",
      "Modesto",
      "Stockton",
      "San Luis Obispo",
      "Redding",
    ],
  },
  colorado: {
    abbr: "CO",
    cities: [
      "Denver",
      "Colorado Springs",
      "Aurora",
      "Fort Collins",
      "Lakewood",
      "Littleton",
      "Boulder",
      "Greeley",
      "Loveland",
      "Castle Rock",
      "Grand Junction",
      "Pueblo",
      "Parker",
      "Broomfield",
    ],
  },
  connecticut: {
    abbr: "CT",
    cities: [
      "Hartford",
      "Stamford",
      "New Haven",
      "Bridgeport",
      "Norwalk",
      "Danbury",
      "Waterbury",
      "Greenwich",
    ],
  },
  delaware: {
    abbr: "DE",
    cities: ["Wilmington", "Dover", "Newark", "Middletown", "Rehoboth Beach"],
  },
  florida: {
    abbr: "FL",
    cities: [
      "Miami",
      "Orlando",
      "Tampa",
      "Jacksonville",
      "Fort Lauderdale",
      "St. Petersburg",
      "West Palm Beach",
      "Sarasota",
      "Naples",
      "Fort Myers",
      "Boca Raton",
      "Tallahassee",
      "Pensacola",
      "Gainesville",
      "Clearwater",
      "Lakeland",
      "Daytona Beach",
      "Port St. Lucie",
      "Ocala",
      "Melbourne",
    ],
  },
  georgia: {
    abbr: "GA",
    cities: [
      "Atlanta",
      "Marietta",
      "Alpharetta",
      "Savannah",
      "Augusta",
      "Athens",
      "Macon",
      "Columbus",
      "Roswell",
      "Lawrenceville",
      "Gainesville",
      "Valdosta",
    ],
  },
  hawaii: { abbr: "HI", cities: ["Honolulu", "Kailua", "Hilo", "Kahului", "Kapolei"] },
  idaho: {
    abbr: "ID",
    cities: [
      "Boise",
      "Meridian",
      "Nampa",
      "Idaho Falls",
      "Coeur d'Alene",
      "Twin Falls",
      "Pocatello",
    ],
  },
  illinois: {
    abbr: "IL",
    cities: [
      "Chicago",
      "Naperville",
      "Aurora",
      "Schaumburg",
      "Rockford",
      "Springfield",
      "Peoria",
      "Champaign",
      "Joliet",
      "Elgin",
      "Bloomington",
      "Bolingbrook",
    ],
  },
  indiana: {
    abbr: "IN",
    cities: [
      "Indianapolis",
      "Fort Wayne",
      "Carmel",
      "Evansville",
      "South Bend",
      "Fishers",
      "Bloomington",
      "Lafayette",
      "Noblesville",
    ],
  },
  iowa: {
    abbr: "IA",
    cities: [
      "Des Moines",
      "Cedar Rapids",
      "Davenport",
      "Iowa City",
      "Sioux City",
      "Ankeny",
      "West Des Moines",
      "Waterloo",
    ],
  },
  kansas: {
    abbr: "KS",
    cities: [
      "Wichita",
      "Overland Park",
      "Kansas City",
      "Olathe",
      "Topeka",
      "Lawrence",
      "Lenexa",
      "Manhattan",
    ],
  },
  kentucky: {
    abbr: "KY",
    cities: [
      "Louisville",
      "Lexington",
      "Bowling Green",
      "Owensboro",
      "Covington",
      "Elizabethtown",
      "Florence",
    ],
  },
  louisiana: {
    abbr: "LA",
    cities: [
      "New Orleans",
      "Baton Rouge",
      "Lafayette",
      "Shreveport",
      "Metairie",
      "Lake Charles",
      "Covington",
      "Monroe",
    ],
  },
  maine: { abbr: "ME", cities: ["Portland", "Bangor", "Lewiston", "South Portland", "Augusta"] },
  maryland: {
    abbr: "MD",
    cities: [
      "Baltimore",
      "Columbia",
      "Rockville",
      "Frederick",
      "Annapolis",
      "Bethesda",
      "Silver Spring",
      "Towson",
      "Gaithersburg",
    ],
  },
  massachusetts: {
    abbr: "MA",
    cities: [
      "Boston",
      "Worcester",
      "Cambridge",
      "Springfield",
      "Quincy",
      "Newton",
      "Framingham",
      "Lowell",
      "Plymouth",
    ],
  },
  michigan: {
    abbr: "MI",
    cities: [
      "Detroit",
      "Grand Rapids",
      "Ann Arbor",
      "Troy",
      "Lansing",
      "Kalamazoo",
      "Sterling Heights",
      "Novi",
      "Traverse City",
      "Flint",
    ],
  },
  minnesota: {
    abbr: "MN",
    cities: [
      "Minneapolis",
      "St. Paul",
      "Rochester",
      "Bloomington",
      "Duluth",
      "Plymouth",
      "Maple Grove",
      "Eden Prairie",
      "St. Cloud",
    ],
  },
  mississippi: {
    abbr: "MS",
    cities: ["Jackson", "Gulfport", "Hattiesburg", "Southaven", "Biloxi", "Tupelo"],
  },
  missouri: {
    abbr: "MO",
    cities: [
      "Kansas City",
      "St. Louis",
      "Springfield",
      "Columbia",
      "O'Fallon",
      "Lee's Summit",
      "St. Charles",
      "Chesterfield",
    ],
  },
  montana: {
    abbr: "MT",
    cities: ["Billings", "Missoula", "Bozeman", "Great Falls", "Kalispell", "Helena"],
  },
  nebraska: { abbr: "NE", cities: ["Omaha", "Lincoln", "Bellevue", "Grand Island", "Kearney"] },
  nevada: {
    abbr: "NV",
    cities: ["Las Vegas", "Henderson", "Reno", "North Las Vegas", "Sparks", "Carson City"],
  },
  "new hampshire": {
    abbr: "NH",
    cities: ["Manchester", "Nashua", "Concord", "Portsmouth", "Dover", "Salem"],
  },
  "new jersey": {
    abbr: "NJ",
    cities: [
      "Newark",
      "Jersey City",
      "Edison",
      "Princeton",
      "Toms River",
      "Cherry Hill",
      "Morristown",
      "Paramus",
      "Freehold",
      "Hackensack",
    ],
  },
  "new mexico": {
    abbr: "NM",
    cities: ["Albuquerque", "Santa Fe", "Las Cruces", "Rio Rancho", "Roswell", "Farmington"],
  },
  "new york": {
    abbr: "NY",
    cities: [
      "New York",
      "Brooklyn",
      "Queens",
      "Long Island",
      "Buffalo",
      "Rochester",
      "Albany",
      "Syracuse",
      "White Plains",
      "Yonkers",
      "Poughkeepsie",
      "Staten Island",
    ],
  },
  "north carolina": {
    abbr: "NC",
    cities: [
      "Charlotte",
      "Raleigh",
      "Greensboro",
      "Durham",
      "Winston-Salem",
      "Cary",
      "Wilmington",
      "Asheville",
      "Fayetteville",
      "Concord",
      "High Point",
      "Greenville",
    ],
  },
  "north dakota": { abbr: "ND", cities: ["Fargo", "Bismarck", "Grand Forks", "Minot"] },
  ohio: {
    abbr: "OH",
    cities: [
      "Columbus",
      "Cleveland",
      "Cincinnati",
      "Dayton",
      "Akron",
      "Toledo",
      "Dublin",
      "Canton",
      "Youngstown",
      "Mason",
    ],
  },
  oklahoma: {
    abbr: "OK",
    cities: ["Oklahoma City", "Tulsa", "Norman", "Edmond", "Broken Arrow", "Lawton", "Stillwater"],
  },
  oregon: {
    abbr: "OR",
    cities: ["Portland", "Salem", "Eugene", "Bend", "Beaverton", "Hillsboro", "Medford", "Gresham"],
  },
  pennsylvania: {
    abbr: "PA",
    cities: [
      "Philadelphia",
      "Pittsburgh",
      "Allentown",
      "Harrisburg",
      "Lancaster",
      "King of Prussia",
      "Erie",
      "Scranton",
      "Reading",
      "York",
      "West Chester",
      "State College",
    ],
  },
  "rhode island": { abbr: "RI", cities: ["Providence", "Warwick", "Cranston", "Newport"] },
  "south carolina": {
    abbr: "SC",
    cities: [
      "Charleston",
      "Columbia",
      "Greenville",
      "Myrtle Beach",
      "Mount Pleasant",
      "Spartanburg",
      "Rock Hill",
      "Hilton Head Island",
    ],
  },
  "south dakota": { abbr: "SD", cities: ["Sioux Falls", "Rapid City", "Aberdeen"] },
  tennessee: {
    abbr: "TN",
    cities: [
      "Nashville",
      "Memphis",
      "Knoxville",
      "Chattanooga",
      "Franklin",
      "Murfreesboro",
      "Clarksville",
      "Johnson City",
      "Jackson",
    ],
  },
  texas: {
    abbr: "TX",
    cities: [
      "Houston",
      "Dallas",
      "Austin",
      "San Antonio",
      "Fort Worth",
      "Plano",
      "Frisco",
      "The Woodlands",
      "Katy",
      "Sugar Land",
      "El Paso",
      "Arlington",
      "McKinney",
      "Round Rock",
      "Corpus Christi",
      "Lubbock",
      "Denton",
      "Tyler",
      "Waco",
      "Midland",
    ],
  },
  utah: {
    abbr: "UT",
    cities: [
      "Salt Lake City",
      "Provo",
      "Ogden",
      "St. George",
      "Lehi",
      "Sandy",
      "Orem",
      "West Jordan",
      "Logan",
    ],
  },
  vermont: { abbr: "VT", cities: ["Burlington", "South Burlington", "Rutland", "Montpelier"] },
  virginia: {
    abbr: "VA",
    cities: [
      "Virginia Beach",
      "Richmond",
      "Arlington",
      "Alexandria",
      "Fairfax",
      "Norfolk",
      "Chesapeake",
      "Charlottesville",
      "Roanoke",
      "Fredericksburg",
      "Leesburg",
      "Williamsburg",
    ],
  },
  washington: {
    abbr: "WA",
    cities: [
      "Seattle",
      "Bellevue",
      "Tacoma",
      "Spokane",
      "Vancouver",
      "Everett",
      "Kent",
      "Redmond",
      "Olympia",
      "Bellingham",
      "Yakima",
    ],
  },
  "west virginia": {
    abbr: "WV",
    cities: ["Charleston", "Huntington", "Morgantown", "Parkersburg"],
  },
  wisconsin: {
    abbr: "WI",
    cities: [
      "Milwaukee",
      "Madison",
      "Green Bay",
      "Appleton",
      "Waukesha",
      "Kenosha",
      "Eau Claire",
      "Brookfield",
    ],
  },
  wyoming: { abbr: "WY", cities: ["Cheyenne", "Casper", "Laramie", "Jackson"] },
};

const ABBR_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_CITIES).map(([name, v]) => [v.abbr.toLowerCase(), name]),
);

/** Width of a bbox in km (longest side). bbox = [south, north, west, east]. */
export function bboxSpanKm(bbox?: [number, number, number, number]): number {
  if (!bbox) return 0;
  const [s, n, w, e] = bbox;
  const lat = Math.abs(n - s) * 111;
  const lng = Math.abs(e - w) * 111 * Math.cos((((s + n) / 2) * Math.PI) / 180);
  return Math.max(lat, lng);
}

/** "Arizona", "AZ", "Arizona, USA", "arizona, united states" → the state entry. */
export function usStateFor(
  location: string,
): { name: string; abbr: string; cities: string[] } | null {
  const raw = location
    .toLowerCase()
    .replace(/\b(usa|u\.s\.a\.|us|u\.s\.|united states( of america)?)\b/g, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  const hit =
    US_STATE_CITIES[raw] ?? (ABBR_TO_STATE[raw] ? US_STATE_CITIES[ABBR_TO_STATE[raw]] : null);
  if (!hit) return null;
  const name = US_STATE_CITIES[raw] ? raw : ABBR_TO_STATE[raw];
  return { name, abbr: hit.abbr, cities: hit.cities };
}

/**
 * Sub-areas to search for a big location, or null when the location is a
 * normal city-sized area (the caller then uses the point/tile search).
 */
export function regionSubAreas(
  location: string,
  bbox?: [number, number, number, number],
  opts: { minSpanKm?: number; maxTiles?: number } = {},
): { kind: "cities" | "grid"; areas: SubArea[] } | null {
  const minSpan = opts.minSpanKm ?? 150;
  const state = usStateFor(location);
  if (state) {
    return {
      kind: "cities",
      areas: state.cities.map((c) => ({ label: `${c}, ${state.abbr}` })),
    };
  }
  const span = bboxSpanKm(bbox);
  if (!bbox || span < minSpan) return null;
  // Unknown big region (a country, a province): coarse grid of ~45 km circles.
  const [s, n, w, e] = bbox;
  const latKm = Math.abs(n - s) * 111;
  const lngKm = Math.abs(e - w) * 111 * Math.cos((((s + n) / 2) * Math.PI) / 180);
  const maxTiles = opts.maxTiles ?? 16;
  const tileKm = Math.max(60, Math.sqrt((latKm * lngKm) / maxTiles));
  const rows = Math.max(1, Math.round(latKm / tileKm));
  const cols = Math.max(1, Math.round(lngKm / tileKm));
  const areas: SubArea[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const lat = s + ((i + 0.5) / rows) * (n - s);
      const lng = w + ((j + 0.5) / cols) * (e - w);
      areas.push({ label: location, lat, lng, radiusM: Math.min(50000, (tileKm / 1.6) * 1000) });
    }
  // Centre-out so the first results are from the middle of the region.
  const cLat = (s + n) / 2;
  const cLng = (w + e) / 2;
  areas.sort(
    (a, b) => Math.hypot(a.lat! - cLat, a.lng! - cLng) - Math.hypot(b.lat! - cLat, b.lng! - cLng),
  );
  return { kind: "grid", areas };
}
