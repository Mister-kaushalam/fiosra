import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        
        # Take a screenshot of the main page
        await page.goto('http://localhost:5173/#/student/now')
        await asyncio.sleep(2)  # Wait for Svelte to render
        await page.screenshot(path='screenshot_courses.png')
        print("Saved screenshot_courses.png")
        
        # Go to CourseStudio
        await page.goto('http://localhost:5173/#/student/nowcourses/builder')
        await asyncio.sleep(2)
        await page.screenshot(path='screenshot_coursestudio.png')
        print("Saved screenshot_coursestudio.png")
        
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())

