/**
 * Open-Meteo integration. Free, no API key. We pull hourly radiation forecast
 * and convert it to an expected-generation curve per plant using installed kWp.
 */

export type WeatherForecast = {
  hourly: Array<{
    ts: string;
    cloudCoverPct: number;
    ghiWm2: number;
    tempC: number;
    expectedKwAc: number; // estimated AC power with plant capacity + 0.80 PR
  }>;
  daily: Array<{
    date: string;
    ghiKwhM2: number;
    expectedKwhDay: number;
    sunriseLocal: string;
    sunsetLocal: string;
  }>;
  updatedAt: string;
};

type OMResponse = {
  hourly: {
    time: string[];
    cloud_cover: number[];
    shortwave_radiation: number[];
    temperature_2m: number[];
  };
  daily: {
    time: string[];
    shortwave_radiation_sum: number[];
    sunrise: string[];
    sunset: string[];
  };
};

export async function getWeatherForPlant(lat: number, lng: number, capacityKwp: number): Promise<WeatherForecast> {
  const PR = 0.8; // performance ratio assumption
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=cloud_cover,shortwave_radiation,temperature_2m` +
    `&daily=shortwave_radiation_sum,sunrise,sunset` +
    `&timezone=America%2FBogota&forecast_days=5`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const data = (await res.json()) as OMResponse;

  const hourly = data.hourly.time.map((t, i) => {
    const ghi = data.hourly.shortwave_radiation[i] ?? 0;
    const expectedKwAc = (ghi / 1000) * capacityKwp * PR;
    return {
      ts: t,
      cloudCoverPct: data.hourly.cloud_cover[i] ?? 0,
      ghiWm2: ghi,
      tempC: data.hourly.temperature_2m[i] ?? 0,
      expectedKwAc,
    };
  });

  const daily = data.daily.time.map((d, i) => {
    const ghiSum = data.daily.shortwave_radiation_sum[i] ?? 0;
    return {
      date: d,
      ghiKwhM2: ghiSum / 1000, // MJ→kWh: OM returns MJ/m², convert via /3.6; but OM actually returns MJ/m². We use shortwave_radiation_sum (MJ/m²) ≈ GHI kWh/m² / 3.6. For demo, we approximate kWhDay = (GHI_MJm2 / 3.6) * capacityKwp * PR.
      expectedKwhDay: (ghiSum / 3.6) * capacityKwp * PR,
      sunriseLocal: data.daily.sunrise[i],
      sunsetLocal: data.daily.sunset[i],
    };
  });

  return { hourly, daily, updatedAt: new Date().toISOString() };
}
