import Header from '@/components/layout/Header';
import { CinematicHero } from '@/components/home/CinematicHero';
import { EyewearServices } from '@/components/home/EyewearServices';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { ArtOfSeeing } from '@/components/home/ArtOfSeeing';
export default function HomePage() {
  return (
    <>
      <Header />
      <main><CinematicHero /><EyewearServices /><FeaturedProducts /><ArtOfSeeing /></main>
    </>
  );
}
