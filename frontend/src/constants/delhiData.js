import DELHI_NCT_BOUNDARY from "./delhiNctBoundary.json";

/**
 * Delhi NCT Reference Data & Constants
 * Strict boundary: NCT of Delhi only (excluding NCR satellite cities like Noida, Gurugram, Ghaziabad, Faridabad)
 */

export const DELHI_CENTER = {
  lat: 28.6139,
  lng: 77.2090,
  zoom: 12,
  name: "Connaught Place, New Delhi"
};

// Bounding box for map framing; point validation uses the NCT polygon below.
export const DELHI_BOUNDS = [
  [28.4046285, 76.8388351],
  [28.8834464, 77.3453379]
];

export const isWithinDelhi = (lat, lng) => {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  const [[south, west], [north, east]] = DELHI_BOUNDS;
  if (lat < south || lat > north || lng < west || lng > east) return false;

  const polygon = DELHI_NCT_BOUNDARY.coordinates;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [currentLat, currentLng] = polygon[index];
    const [previousLat, previousLng] = polygon[previous];
    const crosses = ((currentLat > lat) !== (previousLat > lat))
      && (lng < ((previousLng - currentLng) * (lat - currentLat)) / (previousLat - currentLat) + currentLng);
    if (crosses) inside = !inside;
  }
  return inside;
};

// 11 Administrative & Police Districts of NCT of Delhi
export const DELHI_DISTRICTS = [
  { id: "central", name: "Central Delhi", hq: "Daryaganj", zones: ["Daryaganj", "Paharganj", "Karol Bagh"] },
  { id: "new-delhi", name: "New Delhi", hq: "Parliament Street", zones: ["Connaught Place", "Chanakyapuri", "Barakhamba"] },
  { id: "north", name: "North Delhi", hq: "Civil Lines", zones: ["Civil Lines", "Kotwali", "Sadar Bazar", "Timarpur"] },
  { id: "south", name: "South Delhi", hq: "Hauz Khas", zones: ["Hauz Khas", "Saket", "Mehrauli", "Malviya Nagar"] },
  { id: "south-east", name: "South East Delhi", hq: "Sarita Vihar", zones: ["Lajpat Nagar", "Kalkaji", "Sarita Vihar", "Okhla"] },
  { id: "south-west", name: "South West Delhi", hq: "Vasant Vihar", zones: ["Dwarka", "Vasant Kunj", "Delhi Cantt", "Najafgarh"] },
  { id: "east", name: "East Delhi", hq: "Preet Vihar", zones: ["Preet Vihar", "Mayur Vihar", "Shakarpur", "Kalyanpuri"] },
  { id: "west", name: "West Delhi", hq: "Rajouri Garden", zones: ["Rajouri Garden", "Janakpuri", "Punjabi Bagh", "Tilak Nagar"] },
  { id: "north-west", name: "North West Delhi", hq: "Pitampura", zones: ["Rohini", "Pitampura", "Model Town", "Saraswati Vihar"] },
  { id: "north-east", name: "North East Delhi", hq: "Seelampur", zones: ["Seelampur", "Yamuna Vihar", "Karawal Nagar", "Khajuri Khas"] },
  { id: "shahdara", name: "Shahdara", hq: "Vivek Vihar", zones: ["Vivek Vihar", "Anand Vihar", "GTB Enclave", "Seemapuri"] }
];

// Verified NCT Delhi Landmarks for Search & Safe Route Autocomplete
export const DELHI_LANDMARKS = [
  { id: "cp", name: "Connaught Place (Inner Circle)", district: "New Delhi", lat: 28.6315, lng: 77.2167, type: "Commercial & Transit Hub" },
  { id: "india-gate", name: "India Gate & Kartavya Path", district: "New Delhi", lat: 28.6129, lng: 77.2295, type: "Civic & Memorial Zone" },
  { id: "hauz-khas", name: "Hauz Khas Village & Lake", district: "South Delhi", lat: 28.5535, lng: 77.1945, type: "Cultural & Nightlife District" },
  { id: "saket", name: "Saket District Centre & Select Citywalk", district: "South Delhi", lat: 28.5284, lng: 77.2185, type: "Commercial & Retail Hub" },
  { id: "dwarka-sec21", name: "Dwarka Sector 21 Metro Interchange", district: "South West Delhi", lat: 28.5523, lng: 77.0583, type: "Major Transit Interchange" },
  { id: "dwarka-sec10", name: "Dwarka Sector 10 Central Market", district: "South West Delhi", lat: 28.5815, lng: 77.0566, type: "Sub-City Residential Center" },
  { id: "rohini-sec10", name: "Rohini Sector 10 / Swarn Jayanti", district: "North West Delhi", lat: 28.7188, lng: 77.1192, type: "Urban Commercial Center" },
  { id: "rohini-sec18", name: "Rohini Sector 18 Metro Terminal", district: "North West Delhi", lat: 28.7423, lng: 77.1325, type: "Transit Terminal" },
  { id: "chandni-chowk", name: "Chandni Chowk & Red Fort", district: "North Delhi", lat: 28.6562, lng: 77.2309, type: "Heritage Market Corridor" },
  { id: "lajpat-nagar", name: "Lajpat Nagar Central Market", district: "South East Delhi", lat: 28.5700, lng: 77.2435, type: "Commercial & Transit Market" },
  { id: "rajouri-garden", name: "Rajouri Garden Ring Road Market", district: "West Delhi", lat: 28.6473, lng: 77.1215, type: "Commercial & Transit Hub" },
  { id: "janakpuri-dc", name: "Janakpuri District Centre", district: "West Delhi", lat: 28.6292, lng: 77.0784, type: "Business & Metro Junction" },
  { id: "civil-lines", name: "Civil Lines & DU North Campus", district: "North Delhi", lat: 28.6830, lng: 77.2198, type: "University & Civic Precinct" },
  { id: "mayur-vihar", name: "Mayur Vihar Phase-1 Extension", district: "East Delhi", lat: 28.6085, lng: 77.2974, type: "Residential & Transit Node" },
  { id: "vasant-kunj", name: "Vasant Kunj Nelson Mandela Marg", district: "South West Delhi", lat: 28.5282, lng: 77.1558, type: "Commercial & Institutional" },
  { id: "karol-bagh", name: "Karol Bagh (Ajmal Khan Road)", district: "Central Delhi", lat: 28.6515, lng: 77.1906, type: "High-Footfall Commercial" },
  { id: "kashmere-gate", name: "Kashmere Gate ISBT & Triple Interchange", district: "North Delhi", lat: 28.6675, lng: 77.2303, type: "Inter-State Bus & Metro Hub" },
  { id: "anand-vihar", name: "Anand Vihar ISBT & Railway Station", district: "Shahdara", lat: 28.6469, lng: 77.3160, type: "Eastern Transit Gate" },
  { id: "nehru-place", name: "Nehru Place Commercial Square", district: "South East Delhi", lat: 28.5494, lng: 77.2519, type: "Financial & Tech District" },
  { id: "nsp-pitampura", name: "Netaji Subhash Place (Pitampura)", district: "North West Delhi", lat: 28.6974, lng: 77.1517, type: "Corporate & Metro Plaza" },
  { id: "sarita-vihar", name: "Sarita Vihar Mathura Road Junction", district: "South East Delhi", lat: 28.5303, lng: 77.2912, type: "Arterial Transit & Healthcare" },
  { id: "daryaganj", name: "Daryaganj & Asaf Ali Road", district: "Central Delhi", lat: 28.6416, lng: 77.2405, type: "Administrative & Historic" },
  { id: "delhi-cantt", name: "Delhi Cantt / Dhaula Kuan Enclave", district: "South West Delhi", lat: 28.5921, lng: 77.1610, type: "Defence & Elevated Corridor" },
  { id: "mehrauli", name: "Mehrauli Archeological & Qutub Complex", district: "South Delhi", lat: 28.5244, lng: 77.1855, type: "Heritage & Transit Gateway" },
  { id: "punjabi-bagh", name: "Punjabi Bagh Club Road Junction", district: "West Delhi", lat: 28.6692, lng: 77.1311, type: "Arterial Ring Road Intersection" }
];

// Verified Delhi Police Stations across NCT Districts
export const DELHI_POLICE_STATIONS = [
  {
    id: "ps-connaught-place",
    name: "Connaught Place Police Station",
    zone: "New Delhi",
    lat: 28.6318,
    lng: 77.2185,
    phone: "011-23340050",
    sho_name: "Inspector In-Charge, CP",
    sp_head: "DCP New Delhi District, IPS",
    address: "Baba Kharak Singh Marg, Connaught Place, New Delhi 110001",
    is_sample: false
  },
  {
    id: "ps-parliament-street",
    name: "Parliament Street Police Station",
    zone: "New Delhi",
    lat: 28.6234,
    lng: 77.2120,
    phone: "011-23361100",
    sho_name: "Inspector In-Charge, Parliament St",
    sp_head: "DCP New Delhi District, IPS",
    address: "Sansad Marg, New Delhi 110001",
    is_sample: false
  },
  {
    id: "ps-hauz-khas",
    name: "Hauz Khas Police Station",
    zone: "South Delhi",
    lat: 28.5482,
    lng: 77.2023,
    phone: "011-26510074",
    sho_name: "Inspector In-Charge, Hauz Khas",
    sp_head: "DCP South District, IPS",
    address: "Sri Aurobindo Marg, Hauz Khas, New Delhi 110016",
    is_sample: false
  },
  {
    id: "ps-saket",
    name: "Saket Police Station",
    zone: "South Delhi",
    lat: 28.5225,
    lng: 77.2097,
    phone: "011-29561011",
    sho_name: "Inspector In-Charge, Saket",
    sp_head: "DCP South District, IPS",
    address: "Pushp Vihar Sector 3, Saket, New Delhi 110017",
    is_sample: false
  },
  {
    id: "ps-dwarka-south",
    name: "Dwarka South Police Station",
    zone: "South West Delhi",
    lat: 28.5834,
    lng: 77.0620,
    phone: "011-28080112",
    sho_name: "Inspector In-Charge, Dwarka South",
    sp_head: "DCP Dwarka District, IPS",
    address: "Sector 9, Dwarka, New Delhi 110077",
    is_sample: false
  },
  {
    id: "ps-vasant-kunj-north",
    name: "Vasant Kunj North Police Station",
    zone: "South West Delhi",
    lat: 28.5367,
    lng: 77.1518,
    phone: "011-26892530",
    sho_name: "Inspector In-Charge, Vasant Kunj",
    sp_head: "DCP South West District, IPS",
    address: "Sector D-3, Vasant Kunj, New Delhi 110070",
    is_sample: false
  },
  {
    id: "ps-karol-bagh",
    name: "Karol Bagh Police Station",
    zone: "Central Delhi",
    lat: 28.6508,
    lng: 77.1925,
    phone: "011-25725042",
    sho_name: "Inspector In-Charge, Karol Bagh",
    sp_head: "DCP Central District, IPS",
    address: "Dev Nagar, Karol Bagh, New Delhi 110005",
    is_sample: false
  },
  {
    id: "ps-daryaganj",
    name: "Daryaganj Police Station",
    zone: "Central Delhi",
    lat: 28.6445,
    lng: 77.2412,
    phone: "011-23274640",
    sho_name: "Inspector In-Charge, Daryaganj",
    sp_head: "DCP Central District, IPS",
    address: "Netaji Subhash Marg, Daryaganj, Delhi 110002",
    is_sample: false
  },
  {
    id: "ps-civil-lines",
    name: "Civil Lines Police Station",
    zone: "North Delhi",
    lat: 28.6795,
    lng: 77.2215,
    phone: "011-23912166",
    sho_name: "Inspector In-Charge, Civil Lines",
    sp_head: "DCP North District, IPS",
    address: "Rajpur Road, Civil Lines, Delhi 110054",
    is_sample: false
  },
  {
    id: "ps-kotwali",
    name: "Kotwali Police Station (Chandni Chowk)",
    zone: "North Delhi",
    lat: 28.6565,
    lng: 77.2315,
    phone: "011-23282200",
    sho_name: "Inspector In-Charge, Kotwali",
    sp_head: "DCP North District, IPS",
    address: "Chandni Chowk, Opposite Gurudwara Sis Ganj, Delhi 110006",
    is_sample: false
  },
  {
    id: "ps-lajpat-nagar",
    name: "Lajpat Nagar Police Station",
    zone: "South East Delhi",
    lat: 28.5685,
    lng: 77.2410,
    phone: "011-29810100",
    sho_name: "Inspector In-Charge, Lajpat Nagar",
    sp_head: "DCP South East District, IPS",
    address: "Ring Road, Lajpat Nagar III, New Delhi 110024",
    is_sample: false
  },
  {
    id: "ps-kalkaji",
    name: "Kalkaji Police Station",
    zone: "South East Delhi",
    lat: 28.5442,
    lng: 77.2530,
    phone: "011-26431100",
    sho_name: "Inspector In-Charge, Kalkaji",
    sp_head: "DCP South East District, IPS",
    address: "Hansraj Sethi Marg, Kalkaji, New Delhi 110019",
    is_sample: false
  },
  {
    id: "ps-rajouri-garden",
    name: "Rajouri Garden Police Station",
    zone: "West Delhi",
    lat: 28.6498,
    lng: 77.1235,
    phone: "011-25447700",
    sho_name: "Inspector In-Charge, Rajouri Garden",
    sp_head: "DCP West District, IPS",
    address: "Major Sudesh Kumar Marg, Rajouri Garden, New Delhi 110027",
    is_sample: false
  },
  {
    id: "ps-janakpuri",
    name: "Janakpuri Police Station",
    zone: "West Delhi",
    lat: 28.6255,
    lng: 77.0872,
    phone: "011-25553100",
    sho_name: "Inspector In-Charge, Janakpuri",
    sp_head: "DCP West District, IPS",
    address: "C-2 Block, Janakpuri, New Delhi 110058",
    is_sample: false
  },
  {
    id: "ps-rohini-south",
    name: "Rohini South Police Station",
    zone: "North West Delhi",
    lat: 28.7042,
    lng: 77.1158,
    phone: "011-27941200",
    sho_name: "Inspector In-Charge, Rohini South",
    sp_head: "DCP Rohini District, IPS",
    address: "Sector 3, Rohini, Delhi 110085",
    is_sample: false
  },
  {
    id: "ps-mayur-vihar",
    name: "Mayur Vihar Police Station",
    zone: "East Delhi",
    lat: 28.6050,
    lng: 77.2995,
    phone: "011-22754400",
    sho_name: "Inspector In-Charge, Mayur Vihar",
    sp_head: "DCP East District, IPS",
    address: "Pocket 1, Mayur Vihar Phase 1, Delhi 110091",
    is_sample: false
  },
  {
    id: "ps-anand-vihar",
    name: "Anand Vihar Police Station",
    zone: "Shahdara",
    lat: 28.6510,
    lng: 77.3115,
    phone: "011-22161100",
    sho_name: "Inspector In-Charge, Anand Vihar",
    sp_head: "DCP Shahdara District, IPS",
    address: "Surajmal Vihar, Anand Vihar, Delhi 110092",
    is_sample: false
  },
  {
    id: "ps-seelampur",
    name: "Seelampur Police Station",
    zone: "North East Delhi",
    lat: 28.6698,
    lng: 77.2680,
    phone: "011-22561100",
    sho_name: "Inspector In-Charge, Seelampur",
    sp_head: "DCP North East District, IPS",
    address: "GT Road, Seelampur, Delhi 110053",
    is_sample: false
  }
];

// Official Delhi Emergency Helplines (NCT of Delhi)
export const DELHI_HELPLINES = [
  {
    id: "hl-delhi-police",
    name: "Delhi Police Emergency (ERSS)",
    number: "112",
    description: "Unified emergency response for police, fire, and ambulance across NCT of Delhi.",
    icon: "siren",
    color: "danger",
    category: "Police Dispatch"
  },
  {
    id: "hl-women-police",
    name: "Delhi Police Women Helpline",
    number: "1091",
    description: "24x7 dedicated emergency line for women in distress with rapid PCR dispatch.",
    icon: "shield-alert",
    color: "pink",
    category: "Women Safety"
  },
  {
    id: "hl-dcw",
    name: "Delhi Commission for Women (DCW)",
    number: "181",
    description: "Toll-free crisis intervention, immediate legal aid, and counseling for women.",
    icon: "heart-handshake",
    color: "pink",
    category: "Women Safety"
  },
  {
    id: "hl-cyber-crime",
    name: "Delhi Cyber Crime Reporting (IFSO)",
    number: "1930",
    description: "Immediate reporting for financial cyber frauds, online harassment, and identity theft.",
    icon: "shield",
    color: "cyan",
    category: "Cyber Cell"
  },
  {
    id: "hl-traffic-police",
    name: "Delhi Traffic Police Helpline",
    number: "1095",
    description: "Traffic alerts, breakdown assistance, and green-corridor ambulance requests.",
    icon: "map",
    color: "amber",
    category: "Traffic / Transit"
  },
  {
    id: "hl-cats-ambulance",
    name: "CATS Ambulance Delhi",
    number: "102",
    description: "Centralized Accident & Trauma Services for emergency medical transport.",
    icon: "ambulance",
    color: "green",
    category: "Medical"
  },
  {
    id: "hl-delhi-fire",
    name: "Delhi Fire Service",
    number: "101",
    description: "24x7 fire emergency, building collapse rescue, and disaster relief.",
    icon: "flame",
    color: "danger",
    category: "Rescue"
  },
  {
    id: "hl-senior-citizen",
    name: "Delhi Senior Citizen Helpline",
    number: "1291",
    description: "Delhi Police senior citizen security, medical verification, and distress support.",
    icon: "user-round",
    color: "amber",
    category: "Senior Citizens"
  },
  {
    id: "hl-childline",
    name: "Childline Delhi",
    number: "1098",
    description: "Emergency care, protection, and rescue for children in distress across Delhi.",
    icon: "baby",
    color: "cyan",
    category: "Child Safety"
  },
  {
    id: "hl-anti-obscene",
    name: "Anti-Stalking & Obscene Calls Cell",
    number: "1093",
    description: "Dedicated Delhi Police cell against stalkers, harassment, and threatening calls.",
    icon: "gavel",
    color: "pink",
    category: "Specialized"
  },
  {
    id: "hl-traffic-whatsapp",
    name: "Delhi Traffic Control WhatsApp",
    number: "8750871493",
    description: "Instant photo/video reporting of road obstruction, harassment, or rogue drivers.",
    icon: "phone-call",
    color: "green",
    category: "Traffic"
  },
  {
    id: "hl-elderline",
    name: "National Elderline NCT Delhi",
    number: "14567",
    description: "Government toll-free assistance for legal advice, emotional support, and elder rescue.",
    icon: "smile",
    color: "amber",
    category: "Senior Citizens"
  }
];

