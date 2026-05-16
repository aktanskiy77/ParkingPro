package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ---------- Модели ----------
type User struct {
	ID        uint   `gorm:"primarykey"`
	Name      string `json:"name"`
	Car       string `json:"car"`
	Plate     string `json:"plate" gorm:"uniqueIndex"`
	Password  string `json:"-"`
	Pin       string `json:"-"`
	HasPin    bool   `json:"has_pin" gorm:"default:false"`
	IsGuest   bool   `json:"is_guest" gorm:"default:false"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type ParkingRecord struct {
	ID            uint       `gorm:"primarykey"`
	UserID        uint       `gorm:"index"`
	PlateNumber   string     `json:"plate_number"`
	EntryTime     time.Time  `json:"entry_time"`
	ExitTime      *time.Time `json:"exit_time"`
	IsActive      bool       `json:"is_active" gorm:"index;default:true"`
	Amount        float64    `json:"amount" gorm:"default:0"`
	Paid          bool       `json:"paid" gorm:"default:false"`
	PaymentMethod string     `json:"payment_method"`
	PhotoURL      string     `json:"photo_url"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ---------- Хранилище токенов ----------
var tokenStore sync.Map

func newToken() string {
	b := make([]byte, 20)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func parseToken(c *gin.Context) string {
	raw := c.GetHeader("Authorization")
	if strings.HasPrefix(raw, "Bearer ") {
		return strings.TrimPrefix(raw, "Bearer ")
	}
	return strings.TrimSpace(raw)
}

func tokenUserID(tok string) (uint, bool) {
	v, ok := tokenStore.Load(tok)
	if !ok {
		return 0, false
	}
	return v.(uint), true
}

func hashSecret(s string) string {
	b, _ := bcrypt.GenerateFromPassword([]byte(s), bcrypt.DefaultCost)
	return string(b)
}

func checkSecret(plain, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// ---------- Парковочная математика ----------
const (
	ratePerHour = 60.0
	totalSpaces = 50
	freeMinutes = 5
)

func calcAmount(entry time.Time) float64 {
	mins := time.Since(entry).Minutes()
	if mins < 0 {
		mins = 0
	}
	charged := mins - freeMinutes
	if charged < 0 {
		charged = 0
	}
	return math.Floor(charged/60.0*ratePerHour*100) / 100
}

func minutesSince(entry time.Time) int {
	mins := time.Since(entry).Minutes()
	if mins < 0 {
		mins = 0
	}
	charged := mins - freeMinutes
	if charged < 0 {
		charged = 0
	}
	return int(charged)
}

// ---------- Middleware аутентификации ----------
func authMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tok := parseToken(c)
		if tok == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Токен отсутствует"})
			return
		}
		uid, ok := tokenUserID(tok)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Токен недействителен"})
			return
		}
		var u User
		if err := db.First(&u, uid).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Пользователь не найден"})
			return
		}
		c.Set("user", &u)
		c.Next()
	}
}

func getUser(c *gin.Context) *User {
	return c.MustGet("user").(*User)
}

// ---------- Базовые эндпоинты (без изменений) ----------
func registerHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Name      string `json:"name" binding:"required"`
			CarNumber string `json:"car_number" binding:"required"`
			Car       string `json:"car" binding:"required"`
			Password  string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Заполните все поля"})
			return
		}
		plate := strings.ToUpper(strings.ReplaceAll(req.CarNumber, " ", ""))
		var existing User
		if err := db.Where("plate = ?", plate).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"message": "Этот номер уже зарегистрирован"})
			return
		}
		user := User{
			Name:     req.Name,
			Car:      req.Car,
			Plate:    plate,
			Password: hashSecret(req.Password),
			IsGuest:  false,
		}
		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка создания аккаунта"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Аккаунт создан"})
	}
}

func loginHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			CarNumber string `json:"car_number" binding:"required"`
			Password  string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Заполните поля"})
			return
		}
		plate := strings.ToUpper(strings.ReplaceAll(req.CarNumber, " ", ""))
		var u User
		if err := db.Where("plate = ?", plate).First(&u).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный номер или пароль"})
			return
		}
		if u.IsGuest {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Гостевой аккаунт, используйте въезд по фото"})
			return
		}
		if !checkSecret(req.Password, u.Password) {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный номер или пароль"})
			return
		}
		tok := newToken()
		tokenStore.Store(tok, u.ID)
		c.JSON(http.StatusOK, gin.H{
			"token":   tok,
			"has_pin": u.HasPin,
			"user": gin.H{
				"name":  u.Name,
				"car":   u.Car,
				"plate": u.Plate,
			},
		})
	}
}

func setPinHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := getUser(c)
		var req struct {
			Pin string `json:"pin" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Некорректный запрос"})
			return
		}
		if len(req.Pin) != 4 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "PIN должен содержать 4 цифры"})
			return
		}
		pinHash := hashSecret(req.Pin)
		if err := db.Model(&User{}).Where("id = ?", u.ID).Updates(map[string]interface{}{
			"pin":     pinHash,
			"has_pin": true,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка сохранения PIN"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "PIN установлен"})
	}
}

func verifyPinHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := getUser(c)
		var req struct {
			Pin string `json:"pin" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Некорректный запрос"})
			return
		}
		if len(req.Pin) != 4 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "PIN должен содержать 4 цифры"})
			return
		}
		if !u.HasPin || !checkSecret(req.Pin, u.Pin) {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный PIN"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"valid": true})
	}
}

func statsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var activeCount int64
		db.Model(&ParkingRecord{}).Where("is_active = ?", true).Count(&activeCount)
		free := totalSpaces - int(activeCount)
		if free < 0 {
			free = 0
		}
		c.JSON(http.StatusOK, gin.H{
			"free_spaces":  free,
			"total_spaces": totalSpaces,
			"active_now":   activeCount,
		})
	}
}

func userStatsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := getUser(c)
		var rec ParkingRecord
		err := db.Where("user_id = ? AND is_active = ?", u.ID, true).
			Order("entry_time desc").
			First(&rec).Error
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"is_active":  false,
				"entry_time": nil,
				"minutes":    0,
				"amount":     0,
			})
			return
		}
		amt := calcAmount(rec.EntryTime)
		c.JSON(http.StatusOK, gin.H{
			"is_active":  true,
			"entry_time": rec.EntryTime.Format(time.RFC3339),
			"minutes":    minutesSince(rec.EntryTime),
			"amount":     math.Floor(amt),
			"record_id":  rec.ID,
		})
	}
}

func historyHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := getUser(c)
		var records []ParkingRecord
		db.Where("user_id = ?", u.ID).
			Order("entry_time desc").
			Find(&records)
		c.JSON(http.StatusOK, records)
	}
}

func payHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := getUser(c)
		var req struct {
			Method string `json:"method"`
		}
		_ = c.ShouldBindJSON(&req)
		if req.Method == "" {
			req.Method = "Cash"
		}
		var rec ParkingRecord
		if err := db.Where("user_id = ? AND is_active = ?", u.ID, true).
			Order("entry_time desc").
			First(&rec).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Нет активной сессии"})
			return
		}
		now := time.Now()
		amt := calcAmount(rec.EntryTime)
		if err := db.Model(&rec).Updates(map[string]interface{}{
			"is_active":      false,
			"exit_time":      &now,
			"amount":         math.Floor(amt),
			"paid":           true,
			"payment_method": req.Method,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка оплаты"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"amount":  math.Floor(amt),
			"method":  req.Method,
		})
	}
}

func startParkingHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := getUser(c)

		var existing ParkingRecord
		if err := db.Where("user_id = ? AND is_active = ?", u.ID, true).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"message": "У вас уже есть активная парковка"})
			return
		}

		var activeCount int64
		db.Model(&ParkingRecord{}).Where("is_active = ?", true).Count(&activeCount)
		if int(activeCount) >= totalSpaces {
			c.JSON(http.StatusConflict, gin.H{"message": "Нет свободных мест"})
			return
		}

		record := ParkingRecord{
			UserID:      u.ID,
			PlateNumber: u.Plate,
			EntryTime:   time.Now(),
			IsActive:    true,
		}
		if err := db.Create(&record).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка начала парковки"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"entry_time":   record.EntryTime.Format(time.RFC3339),
			"record_id":    record.ID,
			"free_minutes": freeMinutes,
		})
	}
}

// ============================================================
// OCR — Кыргызские номера. Жёсткий шаблон:
//
//   [0]       = '0'       — всегда ноль
//   [1]       = '1'..'9'  — цифра региона (01..09)
//   [2][3]    = 'K','G'   — всегда KG
//   [4][5][6] = цифры     — серия номера
//   [7][8][9] = буквы A-Z — код (только английские)
//
//   Пример: 01KG666AEL
//
// Tesseract запускается с -l eng — иначе выдаёт кириллицу.
// Путаницы исправляются по позиции:
//   Позиция ЦИФРЫ : O→0  I/L→1  B→8  S→5  Z→2  G→6  Q→0
//   Позиция БУКВЫ : 0→O  1→I    8→B  5→S  2→Z  6→G
// ============================================================

// fixDigit — исправляет символ, который стоит на позиции цифры
func fixDigit(ch byte) byte {
	switch ch {
	case 'O', 'Q':
		return '0'
	case 'I', 'L':
		return '1'
	case 'Z':
		return '2'
	case 'S':
		return '5'
	case 'G':
		return '6'
	case 'B':
		return '8'
	}
	return ch
}

// fixLetter — исправляет символ, который стоит на позиции буквы
func fixLetter(ch byte) byte {
	switch ch {
	case '0':
		return 'O'
	case '1':
		return 'I'
	case '2':
		return 'Z'
	case '5':
		return 'S'
	case '6':
		return 'G'
	case '8':
		return 'B'
	}
	return ch
}

// normalizePlate — жёсткий шаблон побайтово:
//
//  Индекс : 0  1  2  3  4  5  6  7  8  9
//  Тип    : 0  D  K  G  D  D  D  L  L  L
//  Пример : 0  1  K  G  6  6  6  A  E  L
func normalizePlate(rawText string) string {
	plate := strings.ToUpper(strings.TrimSpace(rawText))
	plate = regexp.MustCompile(`[^A-Z0-9]`).ReplaceAllString(plate, "")

	if len(plate) != 10 {
		fmt.Printf("[OCR] len=%d сырой=%q\n", len(plate), plate)
		return ""
	}

	r := []byte(plate)

	// [0] всегда '0'
	r[0] = fixDigit(r[0])
	if r[0] != '0' {
		fmt.Printf("[OCR] pos0!='0': %q\n", plate)
		return ""
	}

	// [1] цифра 1-9
	r[1] = fixDigit(r[1])
	if r[1] < '1' || r[1] > '9' {
		fmt.Printf("[OCR] pos1 не 1-9: %q\n", plate)
		return ""
	}

	// [2][3] всегда KG
	r[2] = fixLetter(r[2])
	r[3] = fixLetter(r[3])
	if r[2] != 'K' || r[3] != 'G' {
		fmt.Printf("[OCR] pos2-3 не KG: %q\n", plate)
		return ""
	}

	// [4][5][6] три цифры
	r[4] = fixDigit(r[4])
	r[5] = fixDigit(r[5])
	r[6] = fixDigit(r[6])

	// [7][8][9] три английские буквы
	r[7] = fixLetter(r[7])
	r[8] = fixLetter(r[8])
	r[9] = fixLetter(r[9])

	res := string(r)
	if !regexp.MustCompile(`^0[1-9]KG\d{3}[A-Z]{3}$`).MatchString(res) {
		fmt.Printf("[OCR] не прошёл regex: %q\n", res)
		return ""
	}
	fmt.Printf("[OCR] OK: %s\n", res)
	return res
}

// preprocessImage — конвертирует в PNG и делает варианты обработки.
// Нужно потому что Tesseract плохо читает webp/jpg напрямую.
func preprocessImage(inputPath string) []string {
	base := strings.TrimSuffix(inputPath, filepath.Ext(inputPath))

	// Конвертируем оригинал в PNG
	basePng := base + "_base.png"
	if err := exec.Command("convert", inputPath, basePng).Run(); err != nil {
		fmt.Printf("[OCR] convert->PNG не удался: %v\n", err)
		basePng = inputPath
	}

	type step struct {
		suffix string
		args   []string
	}
	steps := []step{
		{"_p1.png", []string{"-colorspace", "Gray", "-normalize", "-sharpen", "0x1.5", "-resize", "400%"}},
		{"_p2.png", []string{"-colorspace", "Gray", "-auto-level", "-threshold", "45%", "-resize", "350%"}},
		{"_p3.png", []string{"-contrast-stretch", "5x5%", "-resize", "300%"}},
	}

	var paths []string
	for _, s := range steps {
		out := base + s.suffix
		args := append([]string{basePng}, s.args...)
		args = append(args, out)
		if err := exec.Command("convert", args...).Run(); err == nil {
			paths = append(paths, out)
		} else {
			fmt.Printf("[OCR] preprocess %s: %v\n", s.suffix, err)
		}
	}
	paths = append(paths, basePng)
	return paths
}

// recognizePlateOCR — распознаёт номер с предобработкой
func recognizePlateOCR(imagePath string) string {
	whitelist := "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	modes := []string{"7", "8", "13"}

	imagesToTry := preprocessImage(imagePath)
	fmt.Printf("[OCR] запускаем на %d изображениях\n", len(imagesToTry))

	for _, img := range imagesToTry {
		for _, mode := range modes {
			cmd := exec.Command("tesseract", img, "stdout",
				"-l", "eng",
				"--psm", mode,
				"-c", "tessedit_char_whitelist="+whitelist,
				"-c", "load_system_dawg=false",
				"-c", "load_freq_dawg=false",
			)
			out, err := cmd.Output()
			raw := strings.TrimSpace(string(out))
			fmt.Printf("[OCR] img=%s psm=%s -> %q err=%v\n", filepath.Base(img), mode, raw, err)
			if err != nil {
				continue
			}
			if plate := normalizePlate(raw); plate != "" {
				for _, f := range imagesToTry {
					if f != imagePath {
						os.Remove(f)
					}
				}
				return plate
			}
		}
	}

	for _, f := range imagesToTry {
		if f != imagePath {
			os.Remove(f)
		}
	}
	fmt.Println("[OCR] номер не распознан")
	return ""
}
// Выезд по номеру (завершает активную сессию)
func exitByPlateHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		plate := strings.ToUpper(strings.TrimSpace(c.PostForm("plate")))
		if plate == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Укажите номер авто"})
			return
		}

		// Найти пользователя
		var user User
		if err := db.Where("plate = ?", plate).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Автомобиль с таким номером не найден"})
			return
		}

		// Найти активную парковку
		var record ParkingRecord
		if err := db.Where("user_id = ? AND is_active = ?", user.ID, true).First(&record).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Нет активной парковки для этого номера"})
			return
		}

		// Завершаем парковку
		now := time.Now()
		amount := calcAmount(record.EntryTime)
		record.IsActive = false
		record.ExitTime = &now
		record.Amount = math.Floor(amount)
		record.Paid = true
		record.PaymentMethod = "Cash"
		db.Save(&record)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"plate":   plate,
			"amount":  record.Amount,
			"message": fmt.Sprintf("Автомобиль %s выехал. Сумма: %.0f сом", plate, record.Amount),
		})
	}
}

// ---------- ГЛАВНЫЙ ОБРАБОТЧИК ВЪЕЗДА (с приоритетом ручного ввода) ----------
func entryByPhotoHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Если передан номер вручную – используем его
		manualPlate := strings.ToUpper(strings.TrimSpace(c.PostForm("plate")))
		if manualPlate != "" {
			plate := manualPlate
			// Сохраняем фото, если есть
			file, _ := c.FormFile("photo")
			photoPath := ""
			if file != nil {
				os.MkdirAll("uploads", 0755)
				uniqueName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), file.Filename)
				photoPath = filepath.Join("uploads", uniqueName)
				c.SaveUploadedFile(file, photoPath)
			}
			// Ищем или создаём пользователя
			var user User
			err := db.Where("plate = ?", plate).First(&user).Error
			if err != nil {
				user = User{
					Name:    fmt.Sprintf("Гость %s", plate),
					Car:     "Транспортное средство",
					Plate:   plate,
					IsGuest: true,
				}
				db.Create(&user)
			}

			// ===== НОВАЯ ЛОГИКА: если уже на парковке – завершаем старую сессию =====
			var active ParkingRecord
			hasActive := db.Where("user_id = ? AND is_active = ?", user.ID, true).First(&active).Error == nil
			if hasActive {
				// Завершаем старую парковку (выезд)
				now := time.Now()
				amount := calcAmount(active.EntryTime)
				active.IsActive = false
				active.ExitTime = &now
				active.Amount = math.Floor(amount)
				active.Paid = true
				active.PaymentMethod = "Auto exit"
				db.Save(&active)
			}

			// Проверка свободных мест (после завершения старой сессии)
			var activeCount int64
			db.Model(&ParkingRecord{}).Where("is_active = ?", true).Count(&activeCount)
			if int(activeCount) >= totalSpaces {
				c.JSON(http.StatusConflict, gin.H{"message": "Нет свободных мест"})
				return
			}

			// Создаём новую сессию
			record := ParkingRecord{
				UserID:      user.ID,
				PlateNumber: plate,
				EntryTime:   time.Now(),
				IsActive:    true,
				PhotoURL:    photoPath,
			}
			db.Create(&record)

			// Формируем сообщение
			message := fmt.Sprintf("Въезд разрешён. Номер: %s", plate)
			if hasActive {
				message = fmt.Sprintf("Автомобиль %s выехал (сумма: %.0f сом) и снова заехал. %s", plate, active.Amount, message)
			}

			c.JSON(http.StatusOK, gin.H{
				"success":           true,
				"plate":             plate,
				"is_guest":          user.IsGuest,
				"entry_time":        record.EntryTime.Format(time.RFC3339),
				"record_id":         record.ID,
				"free_minutes":      freeMinutes,
				"previous_session":  hasActive,
				"previous_amount":   active.Amount,
				"message":           message,
			})
			return
		}

		// 2. Если ручного номера нет – распознаём с фото
		file, err := c.FormFile("photo")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Фото не загружено"})
			return
		}

		os.MkdirAll("uploads", 0755)
		uniqueName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), file.Filename)
		originalPath := filepath.Join("uploads", uniqueName)
		if err := c.SaveUploadedFile(file, originalPath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка сохранения фото"})
			return
		}

		plate := recognizePlateOCR(originalPath)
		if plate == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Не удалось распознать номер. Попробуйте чётче сфотографировать или введите номер вручную (поле plate)."})
			return
		}

		var user User
		err = db.Where("plate = ?", plate).First(&user).Error
		if err != nil {
			user = User{
				Name:    fmt.Sprintf("Гость %s", plate),
				Car:     "Транспортное средство",
				Plate:   plate,
				IsGuest: true,
			}
			db.Create(&user)
		}

		// ===== НОВАЯ ЛОГИКА: если уже на парковке – завершаем старую сессию =====
		var active ParkingRecord
		hasActive := db.Where("user_id = ? AND is_active = ?", user.ID, true).First(&active).Error == nil
		if hasActive {
			now := time.Now()
			amount := calcAmount(active.EntryTime)
			active.IsActive = false
			active.ExitTime = &now
			active.Amount = math.Floor(amount)
			active.Paid = true
			active.PaymentMethod = "Auto exit"
			db.Save(&active)
		}

		var activeCount int64
		db.Model(&ParkingRecord{}).Where("is_active = ?", true).Count(&activeCount)
		if int(activeCount) >= totalSpaces {
			c.JSON(http.StatusConflict, gin.H{"message": "Нет свободных мест"})
			return
		}

		record := ParkingRecord{
			UserID:      user.ID,
			PlateNumber: plate,
			EntryTime:   time.Now(),
			IsActive:    true,
			PhotoURL:    originalPath,
		}
		db.Create(&record)

		message := fmt.Sprintf("Въезд разрешён. Номер: %s", plate)
		if hasActive {
			message = fmt.Sprintf("Автомобиль %s выехал (сумма: %.0f сом) и снова заехал. %s", plate, active.Amount, message)
		}

		c.JSON(http.StatusOK, gin.H{
			"success":          true,
			"plate":            plate,
			"is_guest":         user.IsGuest,
			"entry_time":       record.EntryTime.Format(time.RFC3339),
			"record_id":        record.ID,
			"free_minutes":     freeMinutes,
			"previous_session": hasActive,
			"previous_amount":  active.Amount,
			"message":          message,
		})
	}
}
// ---------- MAIN ----------
func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=aktansql dbname=parking port=5432 sslmode=disable TimeZone=Asia/Bishkek"
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		panic("Не удалось подключиться к БД: " + err.Error())
	}

	if err := db.AutoMigrate(&User{}, &ParkingRecord{}); err != nil {
		panic("Миграция не удалась: " + err.Error())
	}

	os.MkdirAll("uploads", 0755)

	gin.SetMode(gin.DebugMode)
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.POST("/api/register", registerHandler(db))
	r.POST("/api/login", loginHandler(db))
	r.GET("/api/stats", statsHandler(db))
	r.POST("/api/entry/scan", entryByPhotoHandler(db))
	r.POST("/api/exit", exitByPlateHandler(db))

	auth := r.Group("/api", authMiddleware(db))
	{
		auth.POST("/set-pin", setPinHandler(db))
		auth.POST("/verify-pin", verifyPinHandler(db))
		auth.GET("/user/stats", userStatsHandler(db))
		auth.GET("/history", historyHandler(db))
		auth.POST("/user/pay", payHandler(db))
		auth.POST("/start-parking", startParkingHandler(db))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	r.Run(":" + port)
}