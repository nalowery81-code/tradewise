insert into public."VerifiedManufacturerAliases"
(alias, canonical_manufacturer, confidence, verification_status, source_type, notes)
values
('State Water Heater','State Water Heaters',1,'verified','manual','Starter manufacturer alias'),
('Lochinvar','Lochinvar',1,'verified','manual','Starter manufacturer alias'),
('Liberty','Liberty Pumps',1,'verified','manual','Starter manufacturer alias'),
('Liberty Pump','Liberty Pumps',1,'verified','manual','Starter manufacturer alias'),
('Sloan','Sloan',1,'verified','manual','Starter manufacturer alias'),
('Gerber','Gerber Plumbing Fixtures',1,'verified','manual','Starter manufacturer alias'),
('Legend Valve','Legend Valve',1,'verified','manual','Starter manufacturer alias'),
('Legend Hydronics','Legend Valve',1,'verified','manual','Starter manufacturer alias')
on conflict (alias_normalized, canonical_normalized) do nothing;
