-- Chunghwa Telecom mobile (AS17421) is now its own group, apart from HiNet fixed (AS3462).
-- Every row stores its ASN, so past tests move to the new group too.
UPDATE tests SET isp_key = 'cht-mobile' WHERE isp_key = 'cht' AND asn = 17421;
