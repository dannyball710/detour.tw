-- New brands, then every remaining unmapped network becomes its own group keyed by its ASN
-- (`as<asn>`), replacing the pooled `other` group. Tests without an ASN stay `other`.
UPDATE tests SET isp_key = 'tfn' WHERE isp_key = 'other' AND asn = 9924;
UPDATE tests SET isp_key = 'twds' WHERE isp_key = 'other' AND asn = 18041;
UPDATE tests SET isp_key = 'skydigital' WHERE isp_key = 'other' AND asn = 134823;
UPDATE tests SET isp_key = 'as' || asn WHERE isp_key = 'other' AND asn IS NOT NULL;
