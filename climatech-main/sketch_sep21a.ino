#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <DHT.h>
#include <time.h>
#include "addons/TokenHelper.h" 

#define WIFI_SSID "NOME DA REDE WIFI"
#define WIFI_PASSWORD "SENHA DA REDE WIFI"
#define API_KEY "API DO FIREBASE"
#define FIREBASE_PROJECT_I"ID DO PROJETO NO FIREBASE"
#define USER_EMAIL "EMAIL DO FIREBASE"
#define USER_PASSWORD "SENHA DO FIREBASE"

#define DHTPIN 4
#define DHTTYPE DHT11 
DHT dht(DHTPIN, DHTTYPE);

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
unsigned long tempoAnterior = 0;

void setup() {
  Serial.begin(115200);
  dht.begin();
  
  Serial.println("\nConectando ao Wi-Fi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { 
    delay(300); 
    Serial.print("."); 
  }
  Serial.println("\nWi-Fi Conectado!");
  
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  
  Serial.print("Sincronizando hora NTP");
  time_t now = time(nullptr);
  while (now < 1600000000) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println("\nHora sincronizada!");
  
  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback; 
  
  Firebase.begin(&config, &auth);
}

void loop() {
  if (Firebase.ready() && (millis() - tempoAnterior > 60000 || tempoAnterior == 0)) {
    time_t timestamp = time(nullptr);

    float t = dht.readTemperature();
    float u = dht.readHumidity();

    if (!isnan(t) && !isnan(u)) {
      tempoAnterior = millis();
      Serial.printf("Leitura -> Temp: %.1f°C | Umid: %.1f%%\n", t, u);
      
      FirebaseJson content;
      content.set("fields/temperatura/doubleValue", t);
      content.set("fields/umidade/doubleValue", u);
      content.set("fields/timestamp/integerValue", (int64_t)timestamp);
      
      if (Firebase.Firestore.createDocument(&fbdo, FIREBASE_PROJECT_ID, "", "leituras", content.raw())) {
        Serial.println("-> OK: Dado salvo no Firebase com sucesso!");
      } else {
        Serial.println("-> ERRO ao salvar: " + fbdo.errorReason());
      }
    } else {
      Serial.println("Falha ao ler o sensor DHT11!");
    }
  }
}