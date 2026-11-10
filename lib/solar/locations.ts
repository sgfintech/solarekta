/**
 * Indicative Philippine solar yield table (kWh per kWp per year, AC, after typical
 * system losses). Values are rounded planning estimates compiled from public
 * PVGIS/SARAH-style long-term averages and MUST be validated against an engineering
 * data source before being presented as precise production. Editing this table is a
 * model-version change.
 */
export interface SolarLocation {
  city: string;
  province: string;
  region: string;
  specificYieldKwhPerKwpYear: number;
}

export const SOLAR_LOCATIONS: SolarLocation[] = [
  { city: "Manila", province: "Metro Manila", region: "NCR", specificYieldKwhPerKwpYear: 1380 },
  { city: "Quezon City", province: "Metro Manila", region: "NCR", specificYieldKwhPerKwpYear: 1380 },
  { city: "Makati", province: "Metro Manila", region: "NCR", specificYieldKwhPerKwpYear: 1370 },
  { city: "Pasig", province: "Metro Manila", region: "NCR", specificYieldKwhPerKwpYear: 1380 },
  { city: "Caloocan", province: "Metro Manila", region: "NCR", specificYieldKwhPerKwpYear: 1375 },
  { city: "Antipolo", province: "Rizal", region: "CALABARZON", specificYieldKwhPerKwpYear: 1370 },
  { city: "Batangas City", province: "Batangas", region: "CALABARZON", specificYieldKwhPerKwpYear: 1400 },
  { city: "Lipa", province: "Batangas", region: "CALABARZON", specificYieldKwhPerKwpYear: 1405 },
  { city: "Tagaytay", province: "Cavite", region: "CALABARZON", specificYieldKwhPerKwpYear: 1360 },
  { city: "Dasmariñas", province: "Cavite", region: "CALABARZON", specificYieldKwhPerKwpYear: 1380 },
  { city: "Santa Rosa", province: "Laguna", region: "CALABARZON", specificYieldKwhPerKwpYear: 1385 },
  { city: "Lucena", province: "Quezon", region: "CALABARZON", specificYieldKwhPerKwpYear: 1380 },
  { city: "Angeles", province: "Pampanga", region: "Central Luzon", specificYieldKwhPerKwpYear: 1400 },
  { city: "San Fernando", province: "Pampanga", region: "Central Luzon", specificYieldKwhPerKwpYear: 1400 },
  { city: "Olongapo", province: "Zambales", region: "Central Luzon", specificYieldKwhPerKwpYear: 1390 },
  { city: "Tarlac City", province: "Tarlac", region: "Central Luzon", specificYieldKwhPerKwpYear: 1410 },
  { city: "Baguio", province: "Benguet", region: "Cordillera", specificYieldKwhPerKwpYear: 1300 },
  { city: "Laoag", province: "Ilocos Norte", region: "Ilocos", specificYieldKwhPerKwpYear: 1450 },
  { city: "Vigan", province: "Ilocos Sur", region: "Ilocos", specificYieldKwhPerKwpYear: 1440 },
  { city: "Dagupan", province: "Pangasinan", region: "Ilocos", specificYieldKwhPerKwpYear: 1430 },
  { city: "Tuguegarao", province: "Cagayan", region: "Cagayan Valley", specificYieldKwhPerKwpYear: 1420 },
  { city: "Cebu City", province: "Cebu", region: "Central Visayas", specificYieldKwhPerKwpYear: 1450 },
  { city: "Mandaue", province: "Cebu", region: "Central Visayas", specificYieldKwhPerKwpYear: 1450 },
  { city: "Dumaguete", province: "Negros Oriental", region: "Central Visayas", specificYieldKwhPerKwpYear: 1430 },
  { city: "Tagbilaran", province: "Bohol", region: "Central Visayas", specificYieldKwhPerKwpYear: 1430 },
  { city: "Iloilo City", province: "Iloilo", region: "Western Visayas", specificYieldKwhPerKwpYear: 1430 },
  { city: "Bacolod", province: "Negros Occidental", region: "Western Visayas", specificYieldKwhPerKwpYear: 1420 },
  { city: "Kalibo", province: "Aklan", region: "Western Visayas", specificYieldKwhPerKwpYear: 1420 },
  { city: "Tacloban", province: "Leyte", region: "Eastern Visayas", specificYieldKwhPerKwpYear: 1380 },
  { city: "Ormoc", province: "Leyte", region: "Eastern Visayas", specificYieldKwhPerKwpYear: 1390 },
  { city: "Cagayan de Oro", province: "Misamis Oriental", region: "Northern Mindanao", specificYieldKwhPerKwpYear: 1400 },
  { city: "Iligan", province: "Lanao del Norte", region: "Northern Mindanao", specificYieldKwhPerKwpYear: 1405 },
  { city: "Davao City", province: "Davao del Sur", region: "Davao", specificYieldKwhPerKwpYear: 1420 },
  { city: "General Santos", province: "South Cotabato", region: "SOCCSKSARGEN", specificYieldKwhPerKwpYear: 1430 },
  { city: "Zamboanga City", province: "Zamboanga del Sur", region: "Zamboanga Peninsula", specificYieldKwhPerKwpYear: 1410 },
  { city: "Butuan", province: "Agusan del Norte", region: "Caraga", specificYieldKwhPerKwpYear: 1400 },
  { city: "Puerto Princesa", province: "Palawan", region: "MIMAROPA", specificYieldKwhPerKwpYear: 1430 },
  { city: "Legazpi", province: "Albay", region: "Bicol", specificYieldKwhPerKwpYear: 1350 },
  { city: "Naga", province: "Camarines Sur", region: "Bicol", specificYieldKwhPerKwpYear: 1360 },
];

export const NATIONAL_AVERAGE_YIELD = 1400;

export function findLocation(city: string): SolarLocation | null {
  const needle = city.trim().toLowerCase();
  return SOLAR_LOCATIONS.find((l) => l.city.toLowerCase() === needle) ?? null;
}
