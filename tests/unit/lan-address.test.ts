import type os from "node:os";
import { describe, expect, it } from "vitest";
import { isPrivateIPv4, lanCandidates, pickLanAddress } from "@/lib/lan-address";

function v4(address: string, internal = false): os.NetworkInterfaceInfo {
  return { address, netmask: "255.255.255.0", family: "IPv4", mac: "00:00:00:00:00:00", internal, cidr: `${address}/24` };
}

const PC = {
  "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)],
  "vEthernet (WSL)": [v4("172.20.48.1")],
  "Wi-Fi": [v4("192.168.0.100")],
};

describe("isPrivateIPv4", () => {
  it("reconoce los rangos privados", () => {
    expect(isPrivateIPv4("192.168.0.100")).toBe(true);
    expect(isPrivateIPv4("10.1.2.3")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.1")).toBe(true);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("169.254.1.1")).toBe(false);
    expect(isPrivateIPv4("localhost")).toBe(false);
  });
});

describe("lanCandidates", () => {
  it("pone primero los adaptadores físicos y deja fuera loopback", () => {
    expect(lanCandidates(PC).map((c) => c.ip)).toEqual(["192.168.0.100", "172.20.48.1"]);
  });
});

describe("pickLanAddress", () => {
  it("la PC cambió de IP: usa la actual aunque APP_URL tenga la vieja", () => {
    expect(pickLanAddress({ interfaces: PC, configuredIp: "192.168.0.101" })).toBe("192.168.0.100");
  });

  it("si la IP de APP_URL sigue siendo de esta PC, la conserva", () => {
    const two = { ...PC, Ethernet: [v4("192.168.0.50")] };
    expect(pickLanAddress({ interfaces: two, configuredIp: "192.168.0.50", routedIp: "192.168.0.100" })).toBe("192.168.0.50");
  });

  it("prefiere la IP por la que entró la persona", () => {
    const two = { ...PC, Ethernet: [v4("192.168.0.50")] };
    expect(pickLanAddress({ interfaces: two, hostIp: "192.168.0.100", configuredIp: "192.168.0.50" })).toBe("192.168.0.100");
  });

  it("ignora una IP de la petición que no es de esta PC", () => {
    expect(pickLanAddress({ interfaces: PC, hostIp: "192.168.0.7" })).toBe("192.168.0.100");
  });

  it("usa la de la ruta por defecto antes que adivinar", () => {
    const two = { ...PC, Ethernet: [v4("10.0.0.5")] };
    expect(pickLanAddress({ interfaces: two, routedIp: "10.0.0.5" })).toBe("10.0.0.5");
  });

  it("sin red local devuelve null", () => {
    expect(pickLanAddress({ interfaces: { lo: [v4("127.0.0.1", true)] } })).toBeNull();
  });
});
