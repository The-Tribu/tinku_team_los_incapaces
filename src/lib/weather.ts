/**
 * Open-Meteo integration. Free, no API key. We pull hourly radiation forecast
 * and convert it to an expected-generation curve per plant using installed kWp.
 *
 * También traemos precipitación y viento (hourly + daily) para alimentar el
 * score de "día ideal de mantenimiento" en el módulo de clima.
 */

export type WeatherForecast = {
  hourly: Array<{
    ts: string;
    cloudCoverPct: number;
    ghiWm2: number;
    tempC: number;
    precipProbPct: number;
    windKmh: number;
    expectedKwAc: number; // estimated AC power with plant capacity + 0.80 PR
  }>;
  daily: Array<{
    date: string;
    ghiKwhM2: number;
    expectedKwhDay: number;
    sunriseLocal: string;
    sunsetLocal: string;
    precipMm: number;
    precipProbMaxPct: number;
    windMaxKmh: number;
    tempMaxC: number;
    tempMinC: number;
  }>;
  updatedAt: string;
};

type OMResponse = {
  hourly: {
    time: string[];
    cloud_cover: number[];
    shortwave_radiation: number[];
    temperature_2m: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
  };
  daily: {
    time: string[];
    shortwave_radiation_sum: number[];
    sunrise: string[];
    sunset: string[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
};

export async function getWeatherForPlant(lat: number, lng: number, capacityKwp: number): Promise<WeatherForecast> {
  const PR = 0.8; // performance ratio assumption
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=cloud_cover,shortwave_radiation,temperature_2m,precipitation_probability,wind_speed_10m` +
    `&daily=shortwave_radiation_sum,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,temperature_2m_max,temperature_2m_min` +
    `&timezone=America%2FBogota&forecast_days=7`;
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
      precipProbPct: data.hourly.precipitation_probability?.[i] ?? 0,
      windKmh: data.hourly.wind_speed_10m?.[i] ?? 0,
      expectedKwAc,
    };
  });

  const daily = data.daily.time.map((d, i) => {
    const ghiSum = data.daily.shortwave_radiation_sum[i] ?? 0;
    return {
      date: d,
      ghiKwhM2: ghiSum / 1000,
      expectedKwhDay: (ghiSum / 3.6) * capacityKwp * PR,
      sunriseLocal: data.daily.sunrise[i],
      sunsetLocal: data.daily.sunset[i],
      precipMm: data.daily.precipitation_sum?.[i] ?? 0,
      precipProbMaxPct: data.daily.precipitation_probability_max?.[i] ?? 0,
      windMaxKmh: data.daily.wind_speed_10m_max?.[i] ?? 0,
      tempMaxC: data.daily.temperature_2m_max?.[i] ?? 0,
      tempMinC: data.daily.temperature_2m_min?.[i] ?? 0,
    };
  });

  return { hourly, daily, updatedAt: new Date().toISOString() };
}
