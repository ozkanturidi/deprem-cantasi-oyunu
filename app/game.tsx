// app/Game.tsx
"use client"; // Bu satır, bu bileşenin istemci tarafında çalışmasını sağlar

import React, { useEffect, useRef, useState } from "react";

const GAME_WIDTH = 800; // Oyun alanının genişliği
const GAME_HEIGHT = 600; // Oyun alanının yüksekliği
const PLAYER_SIZE = 80; // Oyuncu (deprem çantası) boyutu
const ITEM_SIZE = 50; // Düşen eşya boyutu
const PLAYER_SPEED = 7; // Oyuncu hareket hızı
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
  const [isPaused, setIsPaused] = useState<boolean>(false); // YENİ: Duraklatma durumu

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
    if (gameStarted && !gameOver && !isPaused) {
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
      if (e.key === "Escape") {
        if (gameStarted && !gameOver) {
          togglePause();
        }
      } else {
        pressedKeys.current[e.key] = true;
      }
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
  }, [gameStarted, gameOver]); // Sadece bir kere kurulacak

  // Eşya oluşturma
  useEffect(() => {
    if (!gameStarted || gameOver || isPaused) return;

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
  }, [gameStarted, gameOver, isPaused]);

  // Ana Oyun Döngüsü (requestAnimationFrame ile)
  useEffect(() => {
    if (!gameStarted || gameOver || isPaused) {
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
  }, [gameStarted, gameOver, playerX, score, lives, isPaused]); // playerX, score, lives'ı bağımlılık olarak tutmaya devam ediyoruz

  useEffect(() => {
    if (backgroundMusic.current) {
      if (isPaused || !gameStarted) {
        backgroundMusic.current.pause();
      } else {
        backgroundMusic.current.play();
      }
    }
  }, [gameStarted, isPaused]);

  const resetAndStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setIsPaused(false);

    setLives(INITIAL_LIVES); // Canları sıfırla
    setItems([]);
    itemFallSpeed.current = INITIAL_ITEM_FALL_SPEED;
    lastScoreForSpeedIncrease.current = 0; // Hız artırma kontrolünü sıfırla
    if (gameAreaRef.current) {
      gameAreaRef.current.focus();
    }
  };

  const resumeGame = () => {
    setIsPaused(false);
  };

  const navigateHome = () => {
    setGameStarted(false);
    setGameOver(false);
    setScore(0);
    setIsPaused(false);

    setLives(INITIAL_LIVES); // Canları sıfırla
    setItems([]);
    itemFallSpeed.current = INITIAL_ITEM_FALL_SPEED;
    lastScoreForSpeedIncrease.current = 0; // Hız artırma kontrolünü sıfırla
    if (gameAreaRef.current) {
      gameAreaRef.current.focus();
    }
  };

  const togglePause = () => {
    // Oyun çalışmıyorsa veya bittiyse duraklatma menüsü açılamaz
    if (!gameStarted || gameOver) return;
    setIsPaused((prev) => !prev);
  };

  // Helper function to get image path
  const getItemImagePath = (itemType: string): string => {
    // Boşlukları kısa çizgi ile değiştir ve küçük harfe çevir
    const formattedType = itemType.replace(/\s+/g, "-").toLowerCase();
    return `/images/${formattedType}.png`; // Yolu public/images klasörüne göre ayarla
  };

  console.log(gameOver);

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
          <p>
            Merhaba!{" "}
            <span className="highlight">Afetlere hazırlıklı olmak</span> çok
            önemli! Bu oyunda, senin görevin,{" "}
            <span className="highlight">
              afet çantanı en doğru şekilde hazırlamak
            </span>
            . Yukarıdan gelen afet malzemelerini{" "}
            <span className="highlight">çantanla yakala</span>, ancak yalnızca
            <span className="highlight"> gerçekten gerekli olanları</span>.
            <span className="warning">
              Yanlış bir şey yakalarsan, çantan yanar!
            </span>
            <br />
            <br />
            <strong>Nasıl oynanır?</strong> Ok tuşlarıyla oynanır:
            <span className="key">⬅️</span> <span className="key">➡️</span> ile
            çantanı hareket ettir.
            <br />
            <span>
              <strong>Esc tuşu</strong> ya da <strong>ayarlar</strong>{" "}
              butonundan oyunu her an durdurabilirsin.
            </span>
            <br />
            <br />
            <span className="cta">Hazır mısın?</span> O zaman,
            <span className="highlight">
              oyunu başlat butonuna tıklayarak
            </span>{" "}
            başlayabilirsin!
          </p>
          <button
            onClick={resetAndStartGame}
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

          {(gameOver || isPaused) && (
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
              {gameOver ? <h2>Oyun Bitti!</h2> : <></>}
              <p>Puanınız: {score}</p>
              <p>Kalan Canınız: {lives}</p>
              {isPaused && (
                <button
                  onClick={resumeGame}
                  style={{
                    padding: "12px 25px",
                    marginRight: "10px",
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
                  Devam Et
                </button>
              )}
              <button
                onClick={resetAndStartGame}
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
              <button
                onClick={navigateHome}
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
                Ana Ekrana Dön
              </button>
            </div>
          )}
        </>
      )}
      {gameStarted && !gameOver && (
        <button
          onClick={togglePause}
          style={{
            position: "absolute",
            top: "15px",
            right: "15px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            zIndex: 20,
            color: "#263238",
          }}
          aria-label="Ayarlar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            x="0px"
            y="0px"
            width="50"
            height="50"
            viewBox="0 0 50 50"
          >
            <path d="M 22.205078 2 A 1.0001 1.0001 0 0 0 21.21875 2.8378906 L 20.246094 8.7929688 C 19.076509 9.1331971 17.961243 9.5922728 16.910156 10.164062 L 11.996094 6.6542969 A 1.0001 1.0001 0 0 0 10.708984 6.7597656 L 6.8183594 10.646484 A 1.0001 1.0001 0 0 0 6.7070312 11.927734 L 10.164062 16.873047 C 9.583454 17.930271 9.1142098 19.051824 8.765625 20.232422 L 2.8359375 21.21875 A 1.0001 1.0001 0 0 0 2.0019531 22.205078 L 2.0019531 27.705078 A 1.0001 1.0001 0 0 0 2.8261719 28.691406 L 8.7597656 29.742188 C 9.1064607 30.920739 9.5727226 32.043065 10.154297 33.101562 L 6.6542969 37.998047 A 1.0001 1.0001 0 0 0 6.7597656 39.285156 L 10.648438 43.175781 A 1.0001 1.0001 0 0 0 11.927734 43.289062 L 16.882812 39.820312 C 17.936999 40.39548 19.054994 40.857928 20.228516 41.201172 L 21.21875 47.164062 A 1.0001 1.0001 0 0 0 22.205078 48 L 27.705078 48 A 1.0001 1.0001 0 0 0 28.691406 47.173828 L 29.751953 41.1875 C 30.920633 40.838997 32.033372 40.369697 33.082031 39.791016 L 38.070312 43.291016 A 1.0001 1.0001 0 0 0 39.351562 43.179688 L 43.240234 39.287109 A 1.0001 1.0001 0 0 0 43.34375 37.996094 L 39.787109 33.058594 C 40.355783 32.014958 40.813915 30.908875 41.154297 29.748047 L 47.171875 28.693359 A 1.0001 1.0001 0 0 0 47.998047 27.707031 L 47.998047 22.207031 A 1.0001 1.0001 0 0 0 47.160156 21.220703 L 41.152344 20.238281 C 40.80968 19.078827 40.350281 17.974723 39.78125 16.931641 L 43.289062 11.933594 A 1.0001 1.0001 0 0 0 43.177734 10.652344 L 39.287109 6.7636719 A 1.0001 1.0001 0 0 0 37.996094 6.6601562 L 33.072266 10.201172 C 32.023186 9.6248101 30.909713 9.1579916 29.738281 8.8125 L 28.691406 2.828125 A 1.0001 1.0001 0 0 0 27.705078 2 L 22.205078 2 z M 23.056641 4 L 26.865234 4 L 27.861328 9.6855469 A 1.0001 1.0001 0 0 0 28.603516 10.484375 C 30.066026 10.848832 31.439607 11.426549 32.693359 12.185547 A 1.0001 1.0001 0 0 0 33.794922 12.142578 L 38.474609 8.7792969 L 41.167969 11.472656 L 37.835938 16.220703 A 1.0001 1.0001 0 0 0 37.796875 17.310547 C 38.548366 18.561471 39.118333 19.926379 39.482422 21.380859 A 1.0001 1.0001 0 0 0 40.291016 22.125 L 45.998047 23.058594 L 45.998047 26.867188 L 40.279297 27.871094 A 1.0001 1.0001 0 0 0 39.482422 28.617188 C 39.122545 30.069817 38.552234 31.434687 37.800781 32.685547 A 1.0001 1.0001 0 0 0 37.845703 33.785156 L 41.224609 38.474609 L 38.53125 41.169922 L 33.791016 37.84375 A 1.0001 1.0001 0 0 0 32.697266 37.808594 C 31.44975 38.567585 30.074755 39.148028 28.617188 39.517578 A 1.0001 1.0001 0 0 0 27.876953 40.3125 L 26.867188 46 L 23.052734 46 L 22.111328 40.337891 A 1.0001 1.0001 0 0 0 21.365234 39.53125 C 19.90185 39.170557 18.522094 38.59371 17.259766 37.835938 A 1.0001 1.0001 0 0 0 16.171875 37.875 L 11.46875 41.169922 L 8.7734375 38.470703 L 12.097656 33.824219 A 1.0001 1.0001 0 0 0 12.138672 32.724609 C 11.372652 31.458855 10.793319 30.079213 10.427734 28.609375 A 1.0001 1.0001 0 0 0 9.6328125 27.867188 L 4.0019531 26.867188 L 4.0019531 23.052734 L 9.6289062 22.117188 A 1.0001 1.0001 0 0 0 10.435547 21.373047 C 10.804273 19.898143 11.383325 18.518729 12.146484 17.255859 A 1.0001 1.0001 0 0 0 12.111328 16.164062 L 8.8261719 11.46875 L 11.523438 8.7734375 L 16.185547 12.105469 A 1.0001 1.0001 0 0 0 17.28125 12.148438 C 18.536908 11.394293 19.919867 10.822081 21.384766 10.462891 A 1.0001 1.0001 0 0 0 22.132812 9.6523438 L 23.056641 4 z M 25 17 C 20.593567 17 17 20.593567 17 25 C 17 29.406433 20.593567 33 25 33 C 29.406433 33 33 29.406433 33 25 C 33 20.593567 29.406433 17 25 17 z M 25 19 C 28.325553 19 31 21.674447 31 25 C 31 28.325553 28.325553 31 25 31 C 21.674447 31 19 28.325553 19 25 C 19 21.674447 21.674447 19 25 19 z"></path>
          </svg>
        </button>
      )}
    </div>
  );
};

export default Game;
