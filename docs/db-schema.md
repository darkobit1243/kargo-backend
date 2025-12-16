# PostgreSQL Şema Dokümantasyonu (Railway)

Bu doküman, `kargo-backend` projesinin TypeORM entity’lerinden türetilen mevcut PostgreSQL şemasını özetler.

## Bağlantı / TypeORM ayarları

Uygulama DB bağlantısını [src/app.module.ts](../src/app.module.ts) üzerinden kurar.

- `DATABASE_URL`: Railway’nin verdiği Postgres bağlantı adresi
- `DB_SSL`: `true` ise SSL açık (`rejectUnauthorized: false`)
- `DB_SYNC`: `true` ise TypeORM `synchronize` açık (entity’lerden tablo/kolonları otomatik oluşturur/günceller)

Not: Üretimde `DB_SYNC=false` + migration kullanımı genelde daha güvenlidir.

## Tablolar

### `users`
Kaynak: [src/auth/user.entity.ts](../src/auth/user.entity.ts)

- `id` (uuid, PK)
- `publicId` (int, unique, nullable): İnsan-okunur sıralı id; uygulama tarafından sonradan set ediliyor.
- `fcmToken` (text, nullable): Push token
- `email` (varchar/text, unique, not null)
- `password` (varchar/text, not null): hashlenmiş şifre
- `role` (varchar, not null, default: `sender`)
  - Uygulama seviyesi enum: `sender | carrier`
- Profil alanları (hepsi nullable):
  - `fullName`, `phone`, `address`, `vehicleType`, `vehiclePlate`, `serviceArea`, `avatarUrl`
- İstatistik alanları (nullable):
  - `rating` (float)
  - `deliveredCount` (int)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

Önerilen index’ler:
- `users(email)` zaten unique
- Sık sorgulanıyorsa `users(role)` için index

### `listings`
Kaynak: [src/listings/listing.entity.ts](../src/listings/listing.entity.ts)

- `id` (uuid, PK)
- `title` (text/varchar, not null)
- `description` (text/varchar, not null)
- `ownerId` (text/varchar, nullable): kullanıcı id’si (FK tanımı yok, sadece string alan)
- `photos` (text[], not null)
- `weight` (float, not null)
- `dimensions` (jsonb, not null)
  - `{ length: number, width: number, height: number }`
- `fragile` (boolean, not null)
- `pickup_location` (jsonb, not null)
  - `{ lat: number, lng: number }`
- `dropoff_location` (jsonb, not null)
  - `{ lat: number, lng: number }`
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

Önerilen index’ler:
- `listings(ownerId)` (owner ekranları için)

### `offers`
Kaynak: [src/offers/offer.entity.ts](../src/offers/offer.entity.ts)

- `id` (uuid, PK)
- `listingId` (text/varchar, not null)
- `proposerId` (text/varchar, not null)
- `amount` (float, not null)
- `message` (text, nullable)
- `status` (varchar, not null)
  - Uygulama seviyesi enum: `pending | accepted | rejected`
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

Önerilen index’ler:
- `offers(listingId)` (ilan detayindeki teklifler)
- `offers(proposerId)` (carrier teklifleri)
- `offers(status)` (filtreleme gerekiyorsa)

### `deliveries`
Kaynak: [src/deliveries/delivery.entity.ts](../src/deliveries/delivery.entity.ts)

- `id` (uuid, PK)
- `listingId` (text/varchar, not null)
- `carrierId` (text/varchar, nullable)
- `status` (varchar, not null)
  - Uygulama seviyesi enum: `pickup_pending | in_transit | delivered`
- `createdAt` (timestamp)
- `updatedAt` (timestamp)
- `pickupAt` (timestamptz, nullable)
- `deliveredAt` (timestamptz, nullable)
- `pickupQrToken` (text/varchar, nullable)
- `trackingEnabled` (boolean, not null, default: `false`)
- Live tracking alanları (nullable):
  - `lastLat` (float)
  - `lastLng` (float)
  - `lastLocationAt` (timestamptz)

Önerilen index’ler:
- `deliveries(listingId)`
- `deliveries(carrierId)` (carrier teslimat listeleri)
- `deliveries(status)` (duruma göre listeler)

### `messages`
Kaynak: [src/messages/message.entity.ts](../src/messages/message.entity.ts)

- `id` (uuid, PK)
- `listingId` (text/varchar, not null)
- `senderId` (text/varchar, not null)
- `carrierId` (text/varchar, not null)
- `content` (text/varchar, not null)
- `fromCarrier` (boolean, not null, default: `false`)
- `createdAt` (timestamp)

Önerilen index’ler:
- `messages(listingId)` (chat thread)
- `messages(senderId, carrierId)` (konuşma eşleştirme)

## İlişkiler / Foreign Key notu

Entity’ler şimdilik ilişkileri `...Id` string kolonları ile tutuyor; TypeORM tarafında `ManyToOne/OneToMany` ve DB tarafında FK constraint’leri tanımlı değil.

- Bu yaklaşım hızlı geliştirme için pratik.
- Ancak veri bütünlüğü için ileride FK constraint + cascade davranışları eklemek faydalı olur.

## Ratings durumu

`RatingsModule` mevcut olsa da şu an TypeORM entity’si bulunmadığı için DB’de `ratings` tablosu oluşmuyor. Kalıcı hale getirmek istenirse ayrı bir entity + migration eklenmeli.
