import { z } from 'zod';

const id = z.string().min(1).max(32);

export const iranianProvinces = [
  'Tehran', 'Alborz', 'Isfahan', 'Fars', 'Khorasan Razavi', 'Khuzestan', 'Mazandaran', 'Gilan',
  'East Azerbaijan', 'West Azerbaijan', 'Kerman', 'Yazd', 'Qom', 'Hormozgan', 'Kurdistan',
  'Kermanshah', 'Golestan', 'Ardabil', 'Zanjan', 'Semnan', 'Qazvin', 'Markazi', 'Lorestan',
  'Hamedan', 'Ilam', 'Bushehr', 'Chaharmahal and Bakhtiari', 'Kohgiluyeh and Boyer-Ahmad',
  'North Khorasan', 'South Khorasan', 'Sistan and Baluchestan',
] as const;
export type IranianProvince = (typeof iranianProvinces)[number];

const cities: Record<IranianProvince, readonly string[]> = {
  Tehran:['Tehran','Rey','Shemiran'], Alborz:['Karaj'], Isfahan:['Isfahan','Kashan'], Fars:['Shiraz'],
  'Khorasan Razavi':['Mashhad'], Khuzestan:['Ahvaz'], Mazandaran:['Sari'], Gilan:['Rasht'],
  'East Azerbaijan':['Tabriz'], 'West Azerbaijan':['Urmia'], Kerman:['Kerman'], Yazd:['Yazd'],
  Qom:['Qom'], Hormozgan:['Bandar Abbas'], Kurdistan:['Sanandaj'], Kermanshah:['Kermanshah'],
  Golestan:['Gorgan'], Ardabil:['Ardabil'], Zanjan:['Zanjan'], Semnan:['Semnan'], Qazvin:['Qazvin'],
  Markazi:['Arak'], Lorestan:['Khorramabad'], Hamedan:['Hamedan'], Ilam:['Ilam'], Bushehr:['Bushehr'],
  'Chaharmahal and Bakhtiari':['Shahrekord'], 'Kohgiluyeh and Boyer-Ahmad':['Yasuj'],
  'North Khorasan':['Bojnord'], 'South Khorasan':['Birjand'], 'Sistan and Baluchestan':['Zahedan'],
};

export function isSupportedIranianLocation(province: string, city: string): province is IranianProvince {
  return (iranianProvinces as readonly string[]).includes(province)
    && cities[province as IranianProvince].includes(city);
}

const address = z.object({
  firstName:z.string().trim().min(1).max(100), lastName:z.string().trim().min(1).max(100),
  phone:z.string().regex(/^\+\d{7,15}$/), addressLine1:z.string().trim().min(3).max(200),
  addressLine2:z.string().trim().max(200).optional(), city:z.string().trim().min(2).max(100),
  province:z.enum(iranianProvinces), postalCode:z.string().regex(/^\d{10}$/), isDefault:z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (!isSupportedIranianLocation(value.province, value.city)) {
    context.addIssue({ code:z.ZodIssueCode.custom, path:['city'], message:'City is not supported for the selected province' });
  }
});

export const createAddressSchema=address;
export const updateAddressSchema=z.object({
  firstName:z.string().trim().min(1).max(100).optional(), lastName:z.string().trim().min(1).max(100).optional(),
  phone:z.string().regex(/^\+\d{7,15}$/).optional(), addressLine1:z.string().trim().min(3).max(200).optional(),
  addressLine2:z.string().trim().max(200).optional(), city:z.string().trim().min(2).max(100).optional(),
  province:z.enum(iranianProvinces).optional(), postalCode:z.string().regex(/^\d{10}$/).optional(), isDefault:z.boolean().optional(),
}).strict();
export const addressParamsSchema=z.object({addressId:id});
export const shippingQuoteSchema=z.object({province:z.enum(iranianProvinces),currency:z.literal('IRR')}).strict();
export const rateSchema=z.object({province:z.enum(iranianProvinces),method:z.string().trim().min(1).max(80),priceMinor:z.coerce.number().int().min(0),estimatedDays:z.coerce.number().int().min(1).max(60),isActive:z.boolean().optional()}).strict();
export const rateParamsSchema=z.object({rateId:id});
