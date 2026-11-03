#!/usr/bin/env python3
"""Genera los archivos de importación para Google Ads Editor (campañas en pausa).
Uso: python3 tools/marketing/google_ads.py  ->  marketing/google-ads/*.csv
"""
import csv, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "marketing" / "google-ads"
SITE = "https://www.eliteenergy.es/"
base = json.load(open(ROOT / "tools" / "marketing" / "ads-base.json", encoding="utf-8"))
ADS, NEG = base["ADS"], base["NEG"]
CITIES = ["Oviedo", "Gijón", "Avilés"]

# campaña -> (presupuesto diario €, página, ruta1, [(grupo, ciudad o None, palabras clave)])
C = {
 "Marca": (3, "", "elite-energy", [("Marca", None, ['[elite energy]', '[elite energy oviedo]', '[elite energy asturias]', '"elite energy sl"'])]),
 "Luz y gas Asturias": (6, "luz-y-gas.html", "luz-y-gas", [
    ("Asesoría energética Asturias", None, ['"asesoría energética asturias"', '"empresa de energía asturias"', '"comparar tarifas de luz"', '"bajar factura de la luz"', '"optimizar potencia contratada"']),
    ("Luz y gas empresas", None, ['"tarifa luz empresas"', '"tarifa gas empresas"', '"tarifa 3.0td"', '"tarifa 6.1td"', '"luz para negocios"']),
    ("Asesoría energética Oviedo", "Oviedo", ['"asesoría energética oviedo"', '"asesor energético oviedo"', '"empresa de energía oviedo"']),
    ("Asesoría energética Gijón", "Gijón", ['"asesoría energética gijón"', '"asesor energético gijón"', '"empresa de energía gijón"']),
    ("Asesoría energética Avilés", "Avilés", ['"asesoría energética avilés"', '"asesor energético avilés"', '"empresa de energía avilés"'])]),
 "Placas solares Asturias": (8, "placas-solares-asturias.html", "placas-solares", [
    ("Placas solares Asturias", None, ['"placas solares asturias"', '"instalación placas solares asturias"', '"autoconsumo asturias"', '"ayudas placas solares asturias"', '[instaladores placas solares asturias]']),
    ("Placas solares empresas", None, ['"placas solares empresas"', '"fotovoltaica empresas asturias"', '"autoconsumo industrial"', '"placas solares nave"']),
    ("Placas solares Oviedo", "Oviedo", ['"placas solares oviedo"', '"instalación placas solares oviedo"', '"autoconsumo oviedo"']),
    ("Placas solares Gijón", "Gijón", ['"placas solares gijón"', '"instalación placas solares gijón"', '"autoconsumo gijón"']),
    ("Placas solares Avilés", "Avilés", ['"placas solares avilés"', '"instalación placas solares avilés"', '"autoconsumo avilés"'])]),
 "Recarga coche eléctrico": (4, "puntos-de-recarga-asturias.html", "recarga", [
    ("Cargador Asturias", None, ['"cargador coche eléctrico asturias"', '"instalar cargador coche eléctrico"', '"wallbox asturias"', '"punto de recarga garaje comunitario"', '[puntos de recarga empresas asturias]']),
    ("Cargador Oviedo", "Oviedo", ['"cargador coche eléctrico oviedo"', '"instalador cargador coche eléctrico oviedo"', '"wallbox oviedo"']),
    ("Cargador Gijón", "Gijón", ['"cargador coche eléctrico gijón"', '"instalador cargador coche eléctrico gijón"', '"wallbox gijón"']),
    ("Cargador Avilés", "Avilés", ['"cargador coche eléctrico avilés"', '"wallbox avilés"'])]),
 "Eficiencia energética empresas": (4, "eficiencia-energetica-asturias.html", "eficiencia", [
    ("Auditoría energética", None, ['"auditoría energética empresas"', '"auditoría energética asturias"', '"eficiencia energética empresas asturias"', '"aerotermia empresas asturias"']),
    ("Energía reactiva", None, ['"eliminar energía reactiva"', '"batería de condensadores"', '"energía reactiva factura"', '"recargo energía reactiva"'])]),
 "Distribuidores y comerciales": (4, "colaboradores.html", "distribuidores", [
    ("Comercial energía", None, ['"comercial energía asturias"', '"comercial autónomo luz y gas"', '"agente comercial energía"', '"trabajar vendiendo luz y gas"']),
    ("Distribuidor energía", None, ['"distribuidor de energía"', '"colaborador comercializadora luz"', '[ser distribuidor de luz y gas]'])]),
}
MARCA_H = ["Elite Energy · Web Oficial", "Asesoría Energética Asturias", "Oficina en Oviedo", "Estudio de Factura Gratis", "Luz, Gas y Placas Solares", "Llama al 984 518 342",
           "Cargadores y Eficiencia", "Un Asesor Para Todo", "Te Llamamos Con Números", "Toda Asturias", "Hogares y Empresas", "Sin Cortes de Suministro", "Envíanos Tu Factura",
           "Distribuye Con Nosotros", "Paga Menos Energía"]
MARCA_D = ["Elite Energy, asesoría energética en Oviedo. Luz, gas, placas solares y cargadores.",
           "Revisamos tu factura sin coste y te llamamos con el estudio hecho. Toda Asturias.",
           "Calle Posada Herrera 6, Oviedo. Atención por teléfono, correo o en la oficina.",
           "Hogares, comercios e industria. Un solo asesor para tarifa, instalación y eficiencia."]

def city_heads(camp, city):
    t = {"Luz y gas Asturias": [f"Asesoría Energética {city}", f"Asesores Energéticos {city}"],
         "Placas solares Asturias": [f"Placas Solares en {city}", f"Instalación Solar {city}"],
         "Recarga coche eléctrico": [f"Cargador Coche {city}", f"Wallbox Instalado en {city}"]}[camp]
    return t

def check(lst, n):
    for x in lst: assert len(x) <= n, (len(x), x)

OUT.mkdir(parents=True, exist_ok=True)
camps, groups, kws, ads, negs = [], [], [], [], []
for name, (budget, page, path1, gl) in C.items():
    camps.append({"Campaign": name, "Campaign Type": "Search", "Networks": "Google search", "Budget": f"{budget:.2f}", "Budget type": "Daily",
                  "Bid Strategy Type": "Maximize clicks", "Languages": "es", "Location": "Asturias, Principality of Asturias, Spain",
                  "Final URL suffix": f"utm_source=google&utm_medium=cpc&utm_campaign={path1}", "Campaign Status": "Paused"})
    for g, city, words in gl:
        groups.append({"Campaign": name, "Ad Group": g, "Max CPC": "1.20", "Ad Group Status": "Enabled"})
        for w in words:
            ct = "Exact" if w.startswith("[") else "Phrase"
            kws.append({"Campaign": name, "Ad Group": g, "Keyword": w.strip('[]"'), "Criterion Type": ct, "Status": "Enabled"})
        if name == "Marca":
            H, D = MARCA_H, MARCA_D
        else:
            H, D = list(ADS[name]["h"]), list(ADS[name]["d"])
            if city:
                ch = city_heads(name, city)
                H = ch + [h for h in H if "Oviedo" not in h and "Gijón" not in h and "Avilés" not in h][:15 - len(ch)]
        H = (H + MARCA_H)[:15]; check(H, 30); check(D, 90)
        path2 = (city or "").lower().replace("ó", "o").replace("é", "e").replace("á", "a")
        row = {"Campaign": name, "Ad Group": g, "Ad type": "Responsive search ad", "Final URL": SITE + page,
               "Path 1": path1[:15], "Path 2": path2[:15], "Status": "Enabled"}
        for i, h in enumerate(H, 1): row[f"Headline {i}"] = h
        for i, d in enumerate(D, 1): row[f"Description {i}"] = d
        ads.append(row)
    if name != "Marca":
        for n in NEG + ([] if name == "Distribuidores y comerciales" else ["empleo", "trabajo", "oferta de empleo", "sueldo"]):
            negs.append({"Campaign": name, "Keyword": n, "Criterion Type": "Negative phrase"})

def write(fn, rows):
    cols = []
    for r in rows:
        for k in r:
            if k not in cols: cols.append(k)
    with open(OUT / fn, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)

write("1-campanas.csv", camps); write("2-grupos-de-anuncios.csv", groups); write("3-palabras-clave.csv", kws)
write("4-anuncios.csv", ads); write("5-palabras-clave-negativas.csv", negs)
print(len(camps), "campañas ·", len(groups), "grupos ·", len(kws), "palabras clave ·", len(ads), "anuncios ·", len(negs), "negativas")
print("Presupuesto diario total:", sum(c[0] for c in C.values()), "€")
