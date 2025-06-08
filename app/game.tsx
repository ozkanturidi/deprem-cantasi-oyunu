// app/Game.tsx
"use client"; // Bu satır, bu bileşenin istemci tarafında çalışmasını sağlar

import React, { useEffect, useRef, useState } from "react";

const GAME_WIDTH = 800; // Oyun alanının genişliği
const GAME_HEIGHT = 600; // Oyun alanının yüksekliği
const PLAYER_SIZE = 80; // Oyuncu (deprem çantası) boyutu
const ITEM_SIZE = 50; // Düşen eşya boyutu
const PLAYER_SPEED = 10; // Oyuncu hareket hızı
const INITIAL_ITEM_FALL_SPEED = 2; // Başlangıç eşya düşme hızı
const ITEM_SPAWN_INTERVAL = 1500; // Eşya çıkma aralığı (ms)
const INITIAL_LIVES = 5; // Başlangıç kaçırma hakkı sayısı

interface Item {
  id: number;
  x: number;
  y: number;
  type: string;
  isGood: boolean;
  isProcessed: boolean; // YENİ EKLENDİ: Eşyanın işlenip işlenmediğini (çarpıştı/düştü) tutar
}

// Gerekli ve gereksiz eşyaların listesi
const goodItems: string[] = [
  "su",
  "düdük",
  "ilkyardım",
  "konserve",
  "battaniye",
  "pil",
  "fener",
  "radyo",
];
const badItems: string[] = [
  "oyuncak",
  "cips",
  "kitap",
  "vazo",
  "tabak",
  "televizyon",
  "saksı",
];

const Game: React.FC = () => {
  const [playerX, setPlayerX] = useState<number>(
    GAME_WIDTH / 2 - PLAYER_SIZE / 2
  ); // Oyuncunun X konumu
  const [items, setItems] = useState<Item[]>([]); // Düşen eşyaların listesi
  const [score, setScore] = useState<number>(0); // Puan
  const [lives, setLives] = useState<number>(INITIAL_LIVES); // Can sayısı
  const [gameOver, setGameOver] = useState<boolean>(false); // Oyun bitti mi?
  const [gameStarted, setGameStarted] = useState<boolean>(false); // Oyun başladı mı?

  // Ref'ler
  const pressedKeys = useRef<{ [key: string]: boolean }>({}); // Basılı tuşları takip etmek için
  const animationFrameId = useRef<number | null>(null); // requestAnimationFrame ID'sini tutmak için
  const itemFallSpeed = useRef<number>(INITIAL_ITEM_FALL_SPEED); // Eşya düşme hızı (ref ile güncel tutulacak)
  const lastScoreForSpeedIncrease = useRef(0); // Hız artışının tekrar tetiklenmesini engellemek için
  const gameAreaRef = useRef<HTMLDivElement>(null); // Oyun alanının referansı (focus için)

  // Ses Referansları
  const backgroundMusic = useRef<HTMLAudioElement | null>(null);
  const collectSound = useRef<HTMLAudioElement | null>(null);
  const hitOrMissSound = useRef<HTMLAudioElement | null>(null);

  // Sesleri yükleme useEffect
  useEffect(() => {
    backgroundMusic.current = new Audio("/sounds/background_music.wav"); // Bu yolu kendi dosya yoluna göre ayarla
    backgroundMusic.current.loop = true; // Müziği döngüye al
    backgroundMusic.current.volume = 0.3; // Sesi biraz kıs

    collectSound.current = new Audio("/sounds/collect_item.mp3"); // Bu yolu kendi dosya yoluna göre ayarla
    collectSound.current.volume = 0.7;

    hitOrMissSound.current = new Audio("/sounds/miss_or_bad.wav"); // Bu yolu kendi dosya yoluna göre ayarla
    hitOrMissSound.current.volume = 0.8;

    // Bileşen unmount edildiğinde sesleri durdur
    return () => {
      if (backgroundMusic.current) {
        backgroundMusic.current.pause();
        backgroundMusic.current.currentTime = 0;
      }
    };
  }, []); // Sadece bir kere yüklensin

  // Oyun başladığında veya bittiğinde müziği kontrol et
  useEffect(() => {
    if (gameStarted && !gameOver) {
      backgroundMusic.current
        ?.play()
        .catch((e) => console.error("Müzik çalma hatası:", e)); // Otomatik oynatma politikaları nedeniyle hata yakalama
    } else {
      if (backgroundMusic.current) {
        backgroundMusic.current.pause();
        backgroundMusic.current.currentTime = 0;
      }
    }
  }, [gameStarted, gameOver]);

  // Klavye tuş basma/bırakma olaylarını dinlemek için useEffect
  useEffect(() => {
    const handleKeyDownPress = (e: KeyboardEvent) => {
      pressedKeys.current[e.key] = true;
    };
    const handleKeyUpRelease = (e: KeyboardEvent) => {
      pressedKeys.current[e.key] = false;
    };

    window.addEventListener("keydown", handleKeyDownPress);
    window.addEventListener("keyup", handleKeyUpRelease);

    return () => {
      window.removeEventListener("keydown", handleKeyDownPress);
      window.removeEventListener("keyup", handleKeyUpRelease);
    };
  }, []); // Sadece bir kere kurulacak

  // Eşya oluşturma
  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const spawnItem = setInterval(() => {
      const isGood = Math.random() > 0.5; // %50 iyi, %50 kötü
      const itemType = isGood
        ? goodItems[Math.floor(Math.random() * goodItems.length)]
        : badItems[Math.floor(Math.random() * badItems.length)];

      setItems((prevItems) => [
        ...prevItems,
        {
          id: Date.now(),
          x: Math.random() * (GAME_WIDTH - ITEM_SIZE),
          y: -ITEM_SIZE, // Ekranın üstünden başlasın
          type: itemType,
          isGood: isGood,
          isProcessed: false, // YENİ EKLENDİ: Başlangıçta işlenmemiş
        },
      ]);
    }, ITEM_SPAWN_INTERVAL);

    return () => clearInterval(spawnItem);
  }, [gameStarted, gameOver]);

  console.log(items);

  // Ana Oyun Döngüsü (requestAnimationFrame ile)
  useEffect(() => {
    if (!gameStarted || gameOver) {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
      }
      return;
    }

    const animate = () => {
      // Oyuncu hareketini güncelle
      setPlayerX((prevX) => {
        if (pressedKeys.current["ArrowLeft"]) {
          return Math.max(0, prevX - PLAYER_SPEED);
        }
        if (pressedKeys.current["ArrowRight"]) {
          return Math.min(GAME_WIDTH - PLAYER_SIZE, prevX + PLAYER_SPEED);
        }
        return prevX;
      });

      // Eşyaları güncelle ve çarpışma kontrolü
      setItems((prevItems) => {
        const playerCurrentX = playerX; // PlayerX'in anlık değerini yakala
        const newItems: Item[] = []; // Yeni eşya listesi oluşturuyoruz

        prevItems.forEach((item) => {
          // Eğer eşya zaten işlenmişse, direkt atla ve yeni listeye ekleme
          if (item.isProcessed) {
            return;
          }

          // Çarpışma kontrolü
          const playerBottom = GAME_HEIGHT;
          const playerTop = GAME_HEIGHT - PLAYER_SIZE;
          const itemBottom = item.y + ITEM_SIZE;
          const itemTop = item.y;

          const playerLeft = playerCurrentX;
          const playerRight = playerCurrentX + PLAYER_SIZE;
          const itemLeft = item.x;
          const itemRight = item.x + ITEM_SIZE;

          let itemHandled = false; // Eşyanın bu karede işlenip işlenmediğini tutar

          // Düşen eşya oyuncu seviyesine ulaştığında ve yatayda çakıştığında
          if (
            itemBottom >= playerTop &&
            itemTop <= playerBottom &&
            itemRight >= playerLeft &&
            itemLeft <= playerRight
          ) {
            if (item.isGood) {
              setScore((prevScore) => prevScore + 10);
              collectSound.current?.play(); // Doğru eşya toplandı sesi
            } else {
              const newLives = lives - 1;
              if (newLives === 0) {
                setLives(newLives);
                setGameOver(true);
              }
              setLives(newLives);
              setScore((prevScore) => Math.max(0, prevScore - 5));
              hitOrMissSound.current?.play(); // Yanlış eşya toplandı sesi
            }
            itemHandled = true; // Eşya çarpıştı ve işlendi
          }
          // Eşya ekranın altına düştüğünde
          else if (item.y > GAME_HEIGHT) {
            // `else if` kullanarak sadece bir durumun tetiklenmesini sağlıyoruz
            if (item.isGood) {
              const newLives = lives - 1;
              if (newLives === 0) {
                setGameOver(true);
              } else {
                hitOrMissSound.current?.play();
              }
              setLives(newLives);
            }
            itemHandled = true; // Eşya ekran dışına çıktı ve işlendi
          }

          // Eğer eşya işlenmediyse (hala düşüyorsa), yeni pozisyonuyla listeye ekle
          // Aksi takdirde, listeden çıkarılmış sayılacak (eklenmeyecek)
          if (!itemHandled) {
            newItems.push({ ...item, y: item.y + itemFallSpeed.current });
          }
        });

        return newItems;
      });

      // Oyun hızını artırma
      if (
        score > 0 &&
        score % 50 === 0 &&
        score !== lastScoreForSpeedIncrease.current && // Daha önce bu skor seviyesinde hız artırılmamışsa
        itemFallSpeed.current < 10 // Maksimum hıza ulaşılmamışsa
      ) {
        itemFallSpeed.current += 0.1;
        lastScoreForSpeedIncrease.current = score; // Bu skor seviyesini işaretle
      }

      animationFrameId.current = requestAnimationFrame(animate);
    };

    animationFrameId.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [gameStarted, gameOver, playerX, score, lives]); // playerX, score, lives'ı bağımlılık olarak tutmaya devam ediyoruz

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLives(INITIAL_LIVES); // Canları sıfırla
    setItems([]);
    itemFallSpeed.current = INITIAL_ITEM_FALL_SPEED;
    lastScoreForSpeedIncrease.current = 0; // Hız artırma kontrolünü sıfırla
    if (gameAreaRef.current) {
      gameAreaRef.current.focus();
    }
  };

  // Helper function to get image path
  const getItemImagePath = (itemType: string): string => {
    // Boşlukları kısa çizgi ile değiştir ve küçük harfe çevir
    const formattedType = itemType.replace(/\s+/g, "-").toLowerCase();
    return `/images/${formattedType}.png`; // Yolu public/images klasörüne göre ayarla
  };

  return (
    <div
      ref={gameAreaRef}
      style={{
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: "#e0f7fa",
        border: "2px solid #263238",
        position: "relative",
        overflow: "hidden",
        margin: "20px auto",
        borderRadius: "8px",
        boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
        outline: "none",
      }}
      tabIndex={0}
    >
      {!gameStarted && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            padding: "30px 50px",
            borderRadius: "10px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <h2>Deprem Çantası Oyunu</h2>
          <p>Gerekli eşyaları topla, gereksizlerden kaç!</p>
          <button
            onClick={startGame}
            style={{
              padding: "12px 25px",
              fontSize: "18px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              marginTop: "20px",
              transition: "background-color 0.3s ease",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#45a049")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "#4CAF50")
            }
          >
            Oyunu Başlat
          </button>
        </div>
      )}

      {gameStarted && (
        <>
          <div
            style={{
              position: "absolute",
              top: "10px",
              left: "10px",
              fontSize: "24px",
              fontWeight: "bold",
              color: "#333",
              zIndex: 10,
            }}
          >
            Puan: {score} <br />
            Can: {lives}
          </div>

          {/* Oyuncu (Deprem Çantası) - Şimdi img kullanıyor */}
          <img
            src="/images/deprem-cantasi.png" // Kendi görsel yolunuzu buraya ekleyin
            alt="Deprem Çantası"
            style={{
              position: "absolute",
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
              bottom: "0px",
              left: playerX,
              objectFit: "contain", // Görselin boyutuna sığmasını sağlar
              zIndex: 5,
            }}
          />

          {/* Düşen Eşyalar - Şimdi img kullanıyor */}
          {items.map((item) => (
            <img
              key={item.id}
              src={getItemImagePath(item.type)} // Dinamik görsel yolu
              alt={item.type}
              style={{
                position: "absolute",
                width: ITEM_SIZE,
                height: ITEM_SIZE,
                top: item.y,
                left: item.x,
                objectFit: "contain", // Görselin boyutuna sığmasını sağlar
                zIndex: 4,
                // İstersen burada isGood durumuna göre border gibi stil ekleyebilirsin
                // border: item.isGood ? '2px solid green' : '2px solid red',
              }}
            />
          ))}

          {gameOver && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
                backgroundColor: "rgba(255, 255, 255, 0.9)",
                padding: "30px 50px",
                borderRadius: "10px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              <h2>Oyun Bitti!</h2>
              <p>Son Puanınız: {score}</p>
              <p>Kalan Canınız: {lives}</p>
              <button
                onClick={startGame}
                style={{
                  padding: "12px 25px",
                  fontSize: "18px",
                  backgroundColor: "#2196F3",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                  marginTop: "20px",
                  transition: "background-color 0.3s ease",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = "#1976D2")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "#2196F3")
                }
              >
                Tekrar Oyna
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Game;
