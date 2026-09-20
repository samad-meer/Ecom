import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { Tag, Users, GlassWater, Smartphone, Languages, MapPin, Share2, Truck, Landmark } from "lucide-react";
import { PricingSettings } from "./components/sections/PricingSettings";
import { CustomerTypesSettings } from "./components/sections/CustomerTypesSettings";
import { BottleTypesSettings } from "./components/sections/BottleTypesSettings";
import { MobileProfileSettings } from "./components/sections/MobileProfileSettings";
import { LanguageSettings } from "./components/sections/LanguageSettings";
import { AreasSettings } from "./components/sections/AreasSettings";
import { SharedLocationSettings } from "./components/sections/SharedLocationSettings";
import { DeliveryStatusSettings } from "./components/sections/DeliveryStatusSettings";
import { PaymentAccountsSettings } from "./components/sections/PaymentAccountsSettings";

export interface SettingsSectionEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  Component: ComponentType;
}

/**
 * Central registry of admin settings sections.
 * To add a new settings area: build a <YourSettings /> section component
 * (wrapped in <SettingsSection id="..." />) and append one entry here.
 */
export const SETTINGS_SECTIONS: SettingsSectionEntry[] = [
  { id: "pricing", label: "Pricing", icon: Tag, Component: PricingSettings },
  {
    id: "payment-accounts",
    label: "Payment Accounts",
    icon: Landmark,
    Component: PaymentAccountsSettings,
  },
  { id: "areas", label: "Delivery Areas", icon: MapPin, Component: AreasSettings },
  {
    id: "delivery-statuses",
    label: "Delivery Statuses",
    icon: Truck,
    Component: DeliveryStatusSettings,
  },
  {
    id: "shared-location",
    label: "Shared Location",
    icon: Share2,
    Component: SharedLocationSettings,
  },
  {
    id: "customer-types",
    label: "Customer Types",
    icon: Users,
    Component: CustomerTypesSettings,
  },
  {
    id: "bottle-types",
    label: "Bottle Types",
    icon: GlassWater,
    Component: BottleTypesSettings,
  },
  {
    id: "mobile-profile",
    label: "Mobile Profile",
    icon: Smartphone,
    Component: MobileProfileSettings,
  },
  {
    id: "language",
    label: "Language Access",
    icon: Languages,
    Component: LanguageSettings,
  },
];
